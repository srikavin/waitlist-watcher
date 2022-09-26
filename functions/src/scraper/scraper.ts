import axios from "axios";
import {compare} from "fast-json-patch";
import {JSDOM} from "jsdom";

import {fsdb, historical_bucket, updateTopic} from "../common";
import {generateEvents} from "./generate_events";
import * as http from "http";
import * as https from "https";

const COURSE_LIST_URL = (semester: string, prefix: string) => `https://app.testudo.umd.edu/soc/${semester}/${prefix}`;
const SECTIONS_URL = (semester: string, prefix: string, courseList: string) => `https://app.testudo.umd.edu/soc/${semester}/sections?courseIds=${courseList}`;

const BUCKET_SNAPSHOT_PREFIX = (semester: string, department: string) => `${semester}/snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (semester: string, department: string) => `${semester}/events/${department}/`

const httpAgent = new http.Agent({keepAlive: true});
const httpsAgent = new https.Agent({keepAlive: true});

const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
});

fsdb.settings({ignoreUndefinedProperties: true})

export interface ScrapedSection {
    section: string,
    openSeats: number,
    totalSeats: number,
    instructor: string,
    waitlist: number,
    holdfile: number
}

export interface ScrapedCourse {
    course: string,
    name: string,
    sections: Record<string, ScrapedSection>
}

export type ScrapedOutput = Record<string, ScrapedCourse>;

const getCourseList = async (semester: string, prefix: string) => {
    const data = (await axiosInstance.get(COURSE_LIST_URL(semester, prefix))).data;

    return Object.fromEntries([...(new JSDOM(data)).window.document.querySelectorAll(".course")]
        .map((e, i) => {
            let courseTitle = e.querySelector(".course-title");
            if (!courseTitle) {
                // workaround for some course pages
                courseTitle = e.parentNode!.querySelectorAll(`.course-title`)[i]
            }
            return [
                e.id, {
                    name: (courseTitle && courseTitle.textContent) ? courseTitle.textContent : "<unknown>"
                }
            ]
        }));
}

const parseNumber = (val: string) => {
    val = val.trim();

    const isNumber = /^\d+$/.test(val);

    if (!isNumber) {
        throw `'${val}' is not a valid number!`;
    }

    return Number(val);
}

const getSectionInformation = async (semester: string, prefix: string): Promise<ScrapedOutput> => {
    const courseData = await getCourseList(semester, prefix);
    const courseList = Object.keys(courseData).join(",");
    const data = (await axiosInstance.get(SECTIONS_URL(semester, prefix, courseList))).data;

    return Object.fromEntries([...(new JSDOM(data)).window.document.querySelectorAll(".course-sections")]
        .map(course => {
            return [course.id, {
                course: course.id,
                name: courseData[course.id] ? courseData[course.id].name : "<unknown>",
                sections: Object.fromEntries([...course.querySelectorAll(".section")].map(section => {
                    const waitlistField = [...section.querySelectorAll(".waitlist-count")];
                    let holdfile = waitlistField.length === 2 ? parseNumber(waitlistField[1].textContent!) : 0;
                    let sectionName = section.querySelector(".section-id")!.textContent!.trim();
                    return [sectionName, {
                        section: sectionName,
                        openSeats: parseNumber(section.querySelector(".open-seats-count")!.textContent!),
                        totalSeats: parseNumber(section.querySelector(".total-seats-count")!.textContent!),
                        instructor: [...section.querySelectorAll(".section-instructor")].map(e => e.textContent).sort().join(', '),
                        waitlist: parseNumber(waitlistField[0].textContent!),
                        holdfile: holdfile
                    }];
                }))
            }]
        }));
}


export const scraper = async (semester: string, prefix: string, timestamp: string, eventId: string) => {
    const semester_code = semester === "202208" ? "" : semester;

    const events_collection = fsdb.collection("events" + semester_code);
    const docRef = fsdb.collection("course_data" + semester_code).doc(prefix)
    const currentDoc = await docRef.get();

    let previous: any = {
        latest: [],
        timestamp: -1,
        lastRun: '',
        updateCount: 0,
        version: 0
    };
    if (currentDoc.exists) {
        previous = currentDoc.data() as any;
    }

    if (previous.lastRun === timestamp) {
        console.log("Skipping ", semester, prefix, " since lastRun is same as current timestamp: ", timestamp);
        return;
    }

    const data = await getSectionInformation(semester, prefix);

    const diff = compare(previous.latest, data, true);
    const newUpdateCount = previous.updateCount + 1;

    console.log("Scraped ", semester, prefix, " and found ", Object.entries(data).length, " courses with ", diff.length, " changes");

    if (diff.length === 0) {
        if (currentDoc.exists) {
            await docRef.update({
                lastRun: timestamp
            });
        }
        return;
    }

    const events = generateEvents(previous.latest, data, timestamp, semester);

    await historical_bucket.file(BUCKET_SNAPSHOT_PREFIX(semester, prefix) + timestamp + '.json').save(JSON.stringify(data), {
        contentType: "application/json",
        resumable: false,
        gzip: true
    });
    await historical_bucket.file(BUCKET_EVENTS_PREFIX(semester, prefix) + timestamp + '.json').save(JSON.stringify(events), {
        contentType: "application/json",
        resumable: false,
        gzip: true
    });

    const updates = [];

    for (let event of events) {
        if (!event.course) {
            console.log("Skipped over event", event);
            continue;
        }

        let docname = event.course + (event.section ? '-' + event.section : '')

        if (event.type === 'section_added' || event.type === 'section_removed') {
            updates.push(events_collection.doc(event.course).set({
                events: {
                    [event.id]: event
                }
            }, {merge: true}));
        }

        updates.push(events_collection.doc(docname).set({
            events: {
                [event.id]: event
            }
        }, {merge: true}));
    }

    console.log("Updated historical state for ", prefix)

    await Promise.all(updates);

    await docRef.set({
        latest: data,
        timestamp: timestamp,
        lastRun: timestamp,
        updateCount: newUpdateCount,
        version: 2
    });

    console.log("Published notification topic after scraping ", prefix)

    const messageBuffer = Buffer.from(JSON.stringify({
        data: {
            prefix: prefix,
            events: events,
            timestamp: timestamp,
            id: eventId
        }
    }), 'utf8');
    await updateTopic.publishMessage({data: messageBuffer});
}

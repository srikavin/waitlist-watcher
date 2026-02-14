import * as config from "../config.json";
import {eventsIngestTopic, fsdb, historical_bucket, snapshotsIngestTopic, updateTopic} from "../common";

import type {CloudEvent} from "firebase-functions/v2";
import type {CollectionReference} from "firebase-admin/firestore";
import type {MessagePublishedData} from "firebase-functions/v2/pubsub";
import {compare} from "fast-json-patch";
import {generateEvents} from "./generate_events";
import {getSectionInformation} from "./scraper";
import {FSCourseDataDocument, FSEventsDocument} from "@/common/firestore";

const BUCKET_SNAPSHOT_PREFIX = (semester: string, department: string) => `${semester}/snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (semester: string, department: string) => `${semester}/events/${department}/`

const stringifyEventValue = (event: any, key: "old" | "new") => {
    if (!(key in event)) {
        return null;
    }
    const value = event[key];
    if (value === undefined || value === null) {
        return null;
    }
    return String(value);
}

const runScraper = async (semester: string, prefix: string, timestamp: string, eventId: string) => {
    const semester_code = semester === "202208" ? "" : semester;

    const events_collection = fsdb.collection("events" + semester_code) as CollectionReference<FSEventsDocument>;
    const docRef = (fsdb.collection("course_data" + semester_code) as CollectionReference<FSCourseDataDocument>).doc(prefix)
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

    if (Object.entries(data).length === 0) {
        console.warn("Scraping", semester, prefix, "had 0 courses. Ignoring results.");
        return;
    }

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

    const ingestedAt = new Date().toISOString();
    const snapshotPublishes: Promise<string>[] = [];
    for (const courseCode of Object.keys(data)) {
        const course = data[courseCode];
        if (!course || !course.sections) {
            continue;
        }

        for (const sectionCode of Object.keys(course.sections)) {
            const section = course.sections[sectionCode];
            if (!section) {
                continue;
            }

            snapshotPublishes.push(snapshotsIngestTopic.publishMessage({
                data: Buffer.from(JSON.stringify({
                    snapshot_id: `${semester}:${prefix}:${timestamp}:${courseCode}:${sectionCode}`,
                    timestamp: timestamp,
                    semester: semester,
                    department: prefix,
                    course: courseCode,
                    course_name: course.name || null,
                    course_description: course.description || null,
                    section: sectionCode,
                    instructor: section.instructor || null,
                    open_seats: section.openSeats ?? null,
                    total_seats: section.totalSeats ?? null,
                    waitlist: section.waitlist ?? null,
                    holdfile: section.holdfile ?? null,
                    meetings_json: JSON.stringify(section.meetings || []),
                    scrape_event_id: eventId,
                    scrape_published_at: ingestedAt,
                }))
            }));
        }
    }
    if (snapshotPublishes.length > 0) {
        try {
            await Promise.all(snapshotPublishes);
        } catch (e) {
            console.error("Failed publishing snapshot ingest for", prefix, e);
        }
    }

    const ingestPublishes: Promise<string>[] = [];
    for (const event of events) {
        if (!event.id || !event.type || !event.course) {
            continue;
        }

        ingestPublishes.push(eventsIngestTopic.publishMessage({
            data: Buffer.from(JSON.stringify({
                event_id: event.id,
                timestamp: event.timestamp,
                type: event.type,
                course: event.course,
                department: prefix,
                title: event.title,
                section: event.section || null,
                semester: event.semester,
                old_value: stringifyEventValue(event, "old"),
                new_value: stringifyEventValue(event, "new"),
                scrape_event_id: eventId,
                scrape_published_at: ingestedAt
            }))
        }));
    }
    if (ingestPublishes.length > 0) {
        try {
            await Promise.all(ingestPublishes);
        } catch (e) {
            console.error("Failed publishing ingest events for", prefix, e);
        }
    }

    console.log("Published notification topic after scraping ", prefix)

    const messageBuffer = Buffer.from(JSON.stringify({
        data: {
            prefix: prefix,
            events: events,
            semester: semester,
            timestamp: timestamp,
            id: eventId
        }
    }), 'utf8');
    await updateTopic.publishMessage({data: messageBuffer});
}


export const scraperLauncher = async (event: CloudEvent<MessagePublishedData>) => {
    console.log("Scraper triggered");
    const triggerDataRef = fsdb.collection("trigger_data").doc("state");

    let state: any = {
        prefixIndex: 0
    };
    const currentStateDoc = await triggerDataRef.get();
    if (currentStateDoc.exists) {
        state = currentStateDoc.data();
    }

    console.log("Scraping batch of size ", config.batch_size, " at index ", state.prefixIndex);

    const prefixPromises = [];
    for (let semester of config.semesters) {
        for (let i = 0; i < config.batch_size; ++i) {
            const prefix = config.prefixes[(state.prefixIndex + i) % config.prefixes.length];
            prefixPromises.push(runScraper(semester, prefix, event.time, event.id))
            console.log("Started scraper for ", prefix);
        }
    }

    state.prefixIndex = state.prefixIndex + config.batch_size;
    await triggerDataRef.set(state);

    console.log("Waiting for scraper completion");
    await Promise.all(prefixPromises);
    console.log("Scrapers finished");
}

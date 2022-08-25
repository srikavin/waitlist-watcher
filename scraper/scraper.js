const {getFirestore} = require('firebase-admin/firestore');
const axios = require("axios");
const {compare} = require("fast-json-patch");
const {PubSub} = require("@google-cloud/pubsub");
const jsdom = require("jsdom");
const {JSDOM} = jsdom;

const {Storage} = require("@google-cloud/storage");
const {generateEvents} = require("./generate_events");

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const SEMESTER_CODE = "202208";
const COURSE_LIST_URL = (prefix) => `https://app.testudo.umd.edu/soc/${SEMESTER_CODE}/${prefix}`;
const SECTIONS_URL = (prefix, courseList) => `https://app.testudo.umd.edu/soc/${SEMESTER_CODE}/sections?courseIds=${courseList}`;

const BUCKET_SNAPSHOT_PREFIX = (department) => `snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (department) => `events/${department}/`

const db = getFirestore();
db.settings({ignoreUndefinedProperties: true})

const events_collection = db.collection("events");

const pubsub = new PubSub({projectId: "waitlist-watcher"});
const updateTopic = pubsub.topic("prefix-update");

const getCourseList = async (prefix) => {
    const data = (await axios.get(COURSE_LIST_URL(prefix))).data;

    return Object.fromEntries([...(new JSDOM(data)).window.document.querySelectorAll(".course")]
        .map((e, i) => {
            let courseTitle = e.querySelector(".course-title");
            if (!courseTitle) {
                // workaround for some course pages
                courseTitle = e.parentNode.querySelectorAll(`.course-title`)[i]
            }
            return [
                e.id, {
                    name: courseTitle ? courseTitle.textContent : "<unknown>"
                }
            ]
        }));
}

const parseNumber = (val) => {
    val = val.trim();

    const isNumber = /^\d+$/.test(val);

    if (!isNumber) {
        throw `'${val}' is not a valid number!`;
    }

    return Number(val);
}

const getWaitlisted = async (prefix) => {
    const courseData = await getCourseList(prefix);
    const courseList = Object.keys(courseData).join(",");
    const data = (await axios.get(SECTIONS_URL(prefix, courseList))).data;

    return Object.fromEntries([...(new JSDOM(data)).window.document.querySelectorAll(".course-sections")]
        .map(course => {
            return [course.id, {
                course: course.id,
                name: courseData[course.id] ? courseData[course.id].name : "<unknown>",
                sections: Object.fromEntries([...course.querySelectorAll(".section")].map(section => {
                    const waitlistField = [...section.querySelectorAll(".waitlist-count")];
                    let holdfile = waitlistField.length === 2 ? parseNumber(waitlistField[1].textContent) : 0;
                    let sectionName = section.querySelector(".section-id").textContent.trim();
                    return [sectionName, {
                        section: sectionName,
                        openSeats: parseNumber(section.querySelector(".open-seats-count").textContent),
                        totalSeats: parseNumber(section.querySelector(".total-seats-count").textContent),
                        instructor: [...section.querySelectorAll(".section-instructor")].map(e => e.textContent).sort().join(', '),
                        waitlist: parseNumber(waitlistField[0].textContent),
                        holdfile: holdfile
                    }];
                }))
            }]
        }));
}


exports.scraper = async (prefix, context) => {
    const docRef = db.collection("course_data").doc(prefix)
    const currentDoc = await docRef.get();

    let previous = {
        latest: [],
        timestamp: -1,
        lastRun: -1,
        updateCount: 0,
        version: 0
    };
    if (currentDoc.exists) {
        previous = currentDoc.data();
    }

    if (previous.lastRun === context.timestamp) {
        console.log("Skipping ", prefix, " since lastRun is same as current timestamp: ", context.timestamp);
        return;
    }

    const data = await getWaitlisted(prefix);

    const diff = compare(previous.latest, data, true);
    const newUpdateCount = previous.updateCount + 1;

    console.log("Scraped ", prefix, " and found ", Object.entries(data).length, " courses with ", diff.length, " changes");

    if (diff.length === 0) {
        await docRef.update({
            lastRun: context.timestamp
        });
        return;
    }

    const events = generateEvents(previous.latest, data, context.timestamp);

    await docRef.set({
        latest: data,
        timestamp: context.timestamp,
        lastRun: context.timestamp,
        updateCount: newUpdateCount,
        version: 2
    });

    console.log("Published notification topic after scraping ", prefix)

    await historical_bucket.file(BUCKET_SNAPSHOT_PREFIX(prefix) + context.timestamp + '.json').save(JSON.stringify(data));
    await historical_bucket.file(BUCKET_EVENTS_PREFIX(prefix) + context.timestamp + '.json').save(JSON.stringify(events));

    const messageBuffer = Buffer.from(JSON.stringify({
        data: {
            prefix: prefix,
            events: events,
            timestamp: context.timestamp,
            id: context.eventId
        }
    }), 'utf8');

    await updateTopic.publish(messageBuffer);

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
}

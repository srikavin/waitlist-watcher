import * as config from "../config.json";
import {fsdb, historical_bucket, updateTopic} from "../common";

import type {CloudEvent} from "firebase-functions/v2";
import type {MessagePublishedData} from "firebase-functions/v2/pubsub";
import {compare} from "fast-json-patch";
import {generateEvents} from "./generate_events";
import {getSectionInformation} from "./scraper";

const BUCKET_SNAPSHOT_PREFIX = (semester: string, department: string) => `${semester}/snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (semester: string, department: string) => `${semester}/events/${department}/`

const runScraper = async (semester: string, prefix: string, timestamp: string, eventId: string) => {
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

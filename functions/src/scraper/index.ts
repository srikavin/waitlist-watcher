import {measure} from "../telemetry";
import {eventsIngestTopic, fsdb, historical_bucket, snapshotsIngestTopic, updateTopic} from "../common";
import {CURRENT_SEMESTER_ID, SCRAPER_CONFIG} from "../common/config";

import type {Request} from "firebase-functions/v2/https";
import type {CollectionReference} from "firebase-admin/firestore";
import {compare} from "fast-json-patch";
import {generateEvents} from "./generate_events";
import {getSectionInformation} from "./scraper";
import {FSCourseDataDocument, FSEventsDocument} from "../common/firestore";

const BUCKET_SNAPSHOT_PREFIX = (semester: string, department: string) => `${semester}/snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (semester: string, department: string) => `${semester}/events/${department}/`
const PREFIX_WEIGHTS: Record<string, number> = SCRAPER_CONFIG.prefix_weights ?? {};

const getPrefixWeight = (prefix: string): number => {
    const rawWeight = Number(PREFIX_WEIGHTS[prefix] ?? 1);
    return Math.max(1, Math.floor(Number.isFinite(rawWeight) ? rawWeight : 1));
};

const buildWeightedPrefixSchedule = (prefixes: string[]): string[] => {
    if (prefixes.length === 0) {
        return [];
    }

    const items = prefixes.map((prefix, index) => ({
        prefix,
        weight: getPrefixWeight(prefix),
        current: 0,
        index,
    }));

    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const schedule: string[] = [];

    for (let i = 0; i < totalWeight; i++) {
        for (const item of items) {
            item.current += item.weight;
        }

        let best = items[0];
        for (const item of items) {
            if (item.current > best.current) {
                best = item;
                continue;
            }
            if (item.current === best.current && item.index < best.index) {
                best = item;
            }
        }

        schedule.push(best.prefix);
        best.current -= totalWeight;
    }

    return schedule;
};

const WEIGHTED_PREFIXES: string[] = buildWeightedPrefixSchedule(SCRAPER_CONFIG.prefixes);
const SCRAPE_SEMESTERS: string[] = [CURRENT_SEMESTER_ID];

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

const runScraper = async (semester: string, prefix: string, publishedAt: string, eventId: string) => {
    const semester_code = semester === "202208" ? "" : semester;

    const events_collection = fsdb.collection("events" + semester_code) as CollectionReference<FSEventsDocument>;
    const docRef = (fsdb.collection("course_data" + semester_code) as CollectionReference<FSCourseDataDocument>).doc(prefix)
    const currentDoc = await measure("firestore.read_course_state", () => docRef.get());

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

    if (previous.lastRun === publishedAt) {
        console.log("Skipping ", semester, prefix, " since lastRun is same as trigger timestamp: ", publishedAt);
        return;
    }

    const data = await getSectionInformation(semester, prefix);
    const timestamp = new Date().toISOString();

    if (Object.entries(data).length === 0) {
        console.warn("Scraping", semester, prefix, "had 0 courses. Ignoring results.");
        return;
    }

    const diff = await measure("scraper.diff", () => compare(previous.latest, data, true));
    const newUpdateCount = previous.updateCount + 1;

    console.log("Scraped ", semester, prefix, " and found ", Object.entries(data).length, " courses with ", diff.length, " changes");

    if (diff.length === 0) {
        if (currentDoc.exists) {
            await measure("firestore.mark_checked", () => docRef.update({
                lastRun: publishedAt
            }));
        }
        return;
    }

    const events = await measure("scraper.generate_events", () => generateEvents(previous.latest, data, timestamp, semester));

    await measure("gcs.save_snapshot", () => historical_bucket.file(BUCKET_SNAPSHOT_PREFIX(semester, prefix) + timestamp + '.json').save(JSON.stringify(data), {
        contentType: "application/json",
        resumable: false,
        gzip: true
    }));
    await measure("gcs.save_events", () => historical_bucket.file(BUCKET_EVENTS_PREFIX(semester, prefix) + timestamp + '.json').save(JSON.stringify(events), {
        contentType: "application/json",
        resumable: false,
        gzip: true
    }));

    const updates: (() => Promise<unknown>)[] = [];

    for (let event of events) {
        if (!event.course) {
            console.log("Skipped over event", event);
            continue;
        }

        let docname = event.course + (event.section ? '-' + event.section : '')

        if (event.type === 'section_added' || event.type === 'section_removed') {
            updates.push(() => events_collection.doc(event.course).set({
                events: {
                    [event.id]: event
                }
            }, {merge: true}));
        }

        updates.push(() => events_collection.doc(docname).set({
            events: {
                [event.id]: event
            }
        }, {merge: true}));
    }

    console.log("Updated historical state for ", prefix)

    await measure("firestore.write_events", () => Promise.all(updates.map(update => update())), {count: updates.length});

    await measure("firestore.write_course_state", () => docRef.set({
        latest: data,
        timestamp: timestamp,
        lastRun: publishedAt,
        updateCount: newUpdateCount,
        version: 2
    }));

    const snapshotPublishes: (() => Promise<string>)[] = [];
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

            snapshotPublishes.push(() => snapshotsIngestTopic.publishMessage({
                data: Buffer.from(JSON.stringify({
                    snapshot_id: `${semester}:${prefix}:${timestamp}:${courseCode}:${sectionCode}`,
                    timestamp: timestamp,
                    semester: Number(semester),
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
                    scrape_published_at: publishedAt,
                }))
            }));
        }
    }
    if (snapshotPublishes.length > 0) {
        try {
            await measure("pubsub.publish_snapshots", () => Promise.all(snapshotPublishes.map(publish => publish())), {count: snapshotPublishes.length});
        } catch (e) {
            console.error("Failed publishing snapshot ingest for", prefix, e);
        }
    }

    const ingestPublishes: (() => Promise<string>)[] = [];
    for (const event of events) {
        if (!event.id || !event.type || !event.course) {
            continue;
        }

        ingestPublishes.push(() => eventsIngestTopic.publishMessage({
            data: Buffer.from(JSON.stringify({
                event_id: event.id,
                timestamp: event.timestamp,
                type: event.type,
                course: event.course,
                department: prefix,
                title: event.title,
                section: event.section || null,
                semester: Number(event.semester),
                old_value: stringifyEventValue(event, "old"),
                new_value: stringifyEventValue(event, "new"),
                scrape_event_id: eventId,
                scrape_published_at: publishedAt
            }))
        }));
    }
    if (ingestPublishes.length > 0) {
        try {
            await measure("pubsub.publish_events", () => Promise.all(ingestPublishes.map(publish => publish())), {count: ingestPublishes.length});
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
    await measure("pubsub.publish_notifications", () => updateTopic.publishMessage({data: messageBuffer}));
}


export const scraperLauncher = async (request: Request) => {
    if (request.method !== "POST") {
        return {status: 405, body: "Use POST"};
    }
    const scheduledAt = request.get("X-CloudScheduler-ScheduleTime");
    const jobName = request.get("X-CloudScheduler-JobName");
    if (!scheduledAt || !Number.isFinite(Date.parse(scheduledAt)) || !jobName) {
        return {status: 400, body: "Missing or invalid Scheduler headers"};
    }
    const publishedAt = new Date(Date.parse(scheduledAt)).toISOString();
    const eventId = `${jobName}:${publishedAt}`;
    console.log("Scraper triggered", {eventId, scheduledAt: publishedAt});
    if (WEIGHTED_PREFIXES.length === 0) {
        return {status: 503, body: "No prefixes configured"};
    }

    const triggerDataRef = fsdb.collection("trigger_data").doc("state");
    const prefixIndex = await measure("firestore.claim_batch", () => fsdb.runTransaction(async transaction => {
        const snapshot = await transaction.get(triggerDataRef);
        const state = snapshot.exists ? snapshot.data()! : {};
        if (Date.parse(state.lastScheduledTime) >= Date.parse(publishedAt)) {
            return null;
        }
        const index = Number(state.prefixIndex ?? 0) % WEIGHTED_PREFIXES.length;
        transaction.set(triggerDataRef, {
            ...state,
            prefixIndex: (index + SCRAPER_CONFIG.batch_size) % WEIGHTED_PREFIXES.length,
            lastScheduledTime: publishedAt,
        });
        return index;
    }));
    if (prefixIndex === null) {
        return {status: 200, body: {skipped: "Already claimed scheduled run"}};
    }
    console.log("Scraping batch of size", SCRAPER_CONFIG.batch_size, "at index", prefixIndex);

    const batch: {semester: string; prefix: string}[] = [];
    for (const semester of SCRAPE_SEMESTERS) {
        for (let i = 0; i < SCRAPER_CONFIG.batch_size; ++i) {
            const prefix = WEIGHTED_PREFIXES[(prefixIndex + i) % WEIGHTED_PREFIXES.length];
            batch.push({semester, prefix});
        }
    }

    console.log("Waiting for scraper completion");
    const results = await Promise.allSettled(batch.map(({semester, prefix}) => {
        console.log("Started scraper for ", prefix);
        return measure("scraper.department", () => runScraper(semester, prefix, publishedAt, eventId), {semester, department: prefix});
    }));
    let failed = 0;
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            failed++;
            const {semester, prefix} = batch[index];
            console.error("Scraper failed for", semester, prefix, result.reason);
        }
    });
    const summary = {succeeded: results.length - failed, failed};
    console.log("Scrapers finished", summary);
    return {status: failed > 0 ? 500 : 200, body: summary};
}

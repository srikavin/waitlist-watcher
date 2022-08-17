import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {applyPatch} from "fast-json-patch/commonjs/core";
import {generateEvents} from "shared/generate_events";
import {CourseDataCourses} from "shared/types";
import * as crypto from 'crypto';

const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const BUCKET_SNAPSHOT_PREFIX = (department: string) => `snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (department: string) => `events/${department}/`

initializeApp();

const db = getFirestore();
db.settings({ignoreUndefinedProperties: true})

const course_data = db.collection('course_data');
const events_collection = db.collection("events");

const fetch_historical_data = async (department: string) => {
    let departmentRef = course_data.doc(department);
    let historicalRef = departmentRef.collection("historical");

    return await historicalRef.listDocuments();
}

type CourseDataHistoricalEntry = {
    type: 'full',
    contents: CourseDataCourses,
} | {
    type: 'diff',
    basedOn: string,
    diff: any,
}

const reconstructData = (prev: object | null, current: any): CourseDataCourses => {
    console.log(current.type)


    if (current.type === 'full') {
        return current.contents as CourseDataCourses;
    } else {
        if (current.diff.length > 1 && current.diff[1].op === 'replace' && current.diff[1].path === "") {
            console.log("Replaced entire object")
            return current.diff[1].value;
        }

        return applyPatch(prev, current.diff, true, false).newDocument as CourseDataCourses;
    }
}

const normalizeData = (data: any) => {
    if (!Array.isArray(data)) {
        return data;
    }

    return Object.fromEntries((data as any).map((e: any) => {
        return [e.course, {...e, sections: Object.fromEntries(e.sections.map((s: any) => [s.section, s]))}]
    }))
}

const runForDepartment = async (department: string) => {
    const data = await fetch_historical_data(department);
    const uploads = [];

    let prev: object | null = {};
    for (let i = 0; i < data.length; ++i) {

        const curData = (await data[i].get()).data() as CourseDataHistoricalEntry;

        let cur: CourseDataCourses;
        try {
            cur = reconstructData(prev, curData);
        } catch (e) {
            // skip until next full snapshot
            console.log("skipped", data[i].id);
            prev = null;
            continue;
        }

        let normalizedCur = normalizeData(cur);
        uploads.push(historical_bucket.file(BUCKET_SNAPSHOT_PREFIX(department) + data[i].id + '.json').save(JSON.stringify(normalizedCur)));
        console.log("Uploaded snapshot", i, data[i].id);

        if (prev !== null) {
            let normalizedPrev = normalizeData(prev);

            const events = generateEvents(crypto, normalizedPrev, normalizedCur, data[i].id);
            uploads.push(historical_bucket.file(BUCKET_EVENTS_PREFIX(department) + data[i].id + '.json').save(JSON.stringify(events)));

            for (let event of events) {
                if (!event.course) {
                    console.log("Skipped over event", event);
                    continue;
                }

                // @ts-ignore
                let docname = event.course + (event.section ? '-' + event.section : '')

                uploads.push(events_collection.doc(docname).set({
                    events: {
                        [event.id]: event
                    }
                }, {merge: true}));
            }
            console.log("Uploaded events", i, data[i].id, events.length);
        }

        prev = cur;

    }
    await Promise.all(uploads);

    let deletions = []
    for (let i = 0; i < data.length; ++i) {
        deletions.push(data[i].delete())
        console.log("deleting", data[i].id);
    }

    await Promise.all(deletions);
}

runForDepartment("AASP");

export default {};


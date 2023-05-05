import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
// @ts-ignore
import {generateEvents} from "../functions/src/scraper/generate_events";
import {CourseDataCourses} from "../functions/src/types";

import {Storage, CRC32C} from "@google-cloud/storage";
import axios from "axios";

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const BUCKET_SNAPSHOT_PREFIX = (department: string) => `202301/snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (department: string) => `202301/events/${department}/`

initializeApp();

const db = getFirestore();
db.settings({ignoreUndefinedProperties: true})

const events_collection = db.collection("events202301");

const run = async (department: string, snapshot_time: string) => {
    const existing: {
        snapshots: any[]
    } = (await axios.get(`https://waitlist-watcher.uk.r.appspot.com/raw/202301/${department}/snapshots`)).data;

    const {events: existing_events}: {
        events: any[]
    } = (await axios.get(`https://waitlist-watcher.uk.r.appspot.com/raw/202301/${department}/events`)).data;

    let prior: any = null;
    let after: any = null;
    let match: any = null;

    for (let snapshot of existing.snapshots) {
        if (match != null) {
            after = snapshot;
            break;
        }
        if (snapshot.data_time === snapshot_time) {
            match = snapshot
        }
        if (match === null) {
            prior = snapshot;
        }
    }

    if (prior === null || match == null || after === null) {
        console.warn("no prior or after")
        return;
    }


    console.log(prior.data_time)
    console.log(match.data_time)
    console.log(after.data_time)

    let match_events_url = existing_events.find((x) => x.data_time === match.data_time);
    let after_events_url = existing_events.find((x) => x.data_time === after.data_time);

    const match_events = (await axios.get(match_events_url.url)).data;
    const after_events = (await axios.get(after_events_url.url)).data;
    let to_remove_events = match_events.concat(after_events);

    const prev = (await axios.get(prior.url)).data;
    const cur = (await axios.get(after.url)).data;

    const events = generateEvents(prev, cur, after.data_time, "202301");

    const firestoreSets = []

    for (let event of to_remove_events) {
        let docname = event.course + (event.section ? '-' + event.section : '');
        firestoreSets.push(await events_collection.doc(docname).set({
            events: {
                [event.id]: FieldValue.delete()
            }
        }, {merge: true}));
        firestoreSets.push(await events_collection.doc(event.course!).set({
            events: {
                [event.id]: FieldValue.delete()
            }
        }, {merge: true}));
        console.log(docname)
    }

    for (let event of events) {
        if (!event.course) {
            console.log("Skipped over event", event);
            continue;
        }

        // @ts-ignore
        let docname = event.course + (event.section ? '-' + event.section : '')

        if (event.type === 'section_added' || event.type === 'section_removed') {
            firestoreSets.push(events_collection.doc(event.course).set({
                events: {
                    [event.id]: event
                }
            }, {merge: true}));
        }

        firestoreSets.push(events_collection.doc(docname).set({
            events: {
                [event.id]: event
            }
        }, {merge: true}));

        console.log("setting", docname, event.type)
    }

    await Promise.all(firestoreSets);

    await historical_bucket.file(`${BUCKET_SNAPSHOT_PREFIX(department)}${match.data_time}.json`).move(`disabled/${BUCKET_SNAPSHOT_PREFIX(department)}${match.data_time}.json`);
    await historical_bucket.file(`${BUCKET_EVENTS_PREFIX(department)}${match.data_time}.json`).move(`disabled/${BUCKET_EVENTS_PREFIX(department)}${match.data_time}.json`);
    await historical_bucket.file(`${BUCKET_EVENTS_PREFIX(department)}${after.data_time}.json`).move(`disabled/${BUCKET_EVENTS_PREFIX(department)}${after.data_time}.json`);
    await historical_bucket.file(`${BUCKET_EVENTS_PREFIX(department)}${after.data_time}.json`).save(JSON.stringify(events), {
        contentType: "application/json",
        resumable: false,
        gzip: true
    });

    return;
}

const remove_empty_snapshots = async (department: string) => {
    const existing: {
        snapshots: any[]
    } = (await axios.get(`https://waitlist-watcher.uk.r.appspot.com/raw/202301/${department}/snapshots`)).data;

    for (const snapshot of existing.snapshots) {
        if (snapshot.meta.file_size === "22") {
            console.log(department, snapshot.data_time)
            await run(department, snapshot.data_time)
        }
    }
}

async function runForDepartmentWithRetries(dept: string) {
    for (let i = 0; i < 5; ++i) {
        try {
            await remove_empty_snapshots(dept);
            return;
        } catch (e) {
            console.error(e, dept);
        }
    }
    throw Error("failed after 5 retries");
}

(async () => {
    let departments = ["AASP", "AAST", "AGNR", "AGST", "AMSC", "AMST", "ANSC", "ANTH", "AOSC", "ARAB", "ARCH", "AREC", "ARHU", "ARMY", "ARSC", "ARTH", "ARTT", "ASTR", "BCHM", "BIOE", "BIOL", "BIOM", "BIPH", "BISI", "BMGT", "BMSO", "BSCI", "BSCV", "BSGC", "BSOS", "BSST", "BUAC", "BUDT", "BUFN", "BULM", "BUMK", "BUSI", "BUSM", "BUSO", "CBMG", "CCJS", "CHBE", "CHEM", "CHIN", "CHPH", "CHSE", "CINE", "CLAS", "CLFS", "CMLT", "CMSC", "COMM", "CPBE", "CPET", "CPGH", "CPJT", "CPMS", "CPPL", "CPSA", "CPSD", "CPSF", "CPSG", "CPSN", "CPSP", "CPSS", "DANC", "DATA", "ECON", "EDCP", "EDHD", "EDHI", "EDMS", "EDPS", "EDSP", "EDUC", "EMBA", "ENAE", "ENBC", "ENCE", "ENCO", "ENEB", "ENEE", "ENES", "ENFP", "ENGL", "ENMA", "ENME", "ENPM", "ENRE", "ENSE", "ENSP", "ENST", "ENTM", "ENTS", "EPIB", "FGSM", "FIRE", "FMSC", "FREN", "GEMS", "GEOG", "GEOL", "GERM", "GREK", "GVPT", "HACS", "HDCC", "HEBR", "HESI", "HESP", "HHUM", "HISP", "HIST", "HLSA", "HLSC", "HLTH", "HNUH", "HONR", "IDEA", "IMDM", "IMMR", "INAG", "INFM", "INST", "ISRL", "ITAL", "JAPN", "JOUR", "JWST", "KNES", "KORA", "LACS", "LARC", "LATN", "LBSC", "LGBT", "LING", "MAIT", "MATH", "MEES", "MIEH", "MITH", "MLAW", "MLSC", "MSML", "MUED", "MUSC", "MUSP", "NACS", "NAVY", "NEUR", "NFSC", "NIAP", "NIAV", "PEER", "PERS", "PHIL", "PHPE", "PHSC", "PHYS", "PLCY", "PLSC", "PORT", "PSYC", "RDEV", "RELS", "RUSS", "SLAA", "SLLC", "SMLP", "SOCY", "SPAN", "SPHL", "STAT", "SURV", "TDPS", "THET", "TLPL", "TLTC", "UMEI", "UNIV", "URSP", "USLT", "VMSC", "WGSS", "WMST"];
    while (departments.length > 0) {
        await Promise.all(departments.splice(0, 10).map(runForDepartmentWithRetries))
        console.log(departments.length)
    }
})();


export default {};

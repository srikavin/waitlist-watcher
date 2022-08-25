import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
// @ts-ignore
import {generateEvents} from "../scraper/generate_events";
import {CourseDataCourses} from "./types";

import {Storage, CRC32C} from "@google-cloud/storage";
import axios from "axios";

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const BUCKET_SNAPSHOT_PREFIX = (department: string) => `snapshots/${department}/`
const BUCKET_EVENTS_PREFIX = (department: string) => `events/${department}/`

initializeApp();

const db = getFirestore();
db.settings({ignoreUndefinedProperties: true})

const events_collection = db.collection("events");

const runForDepartment = async (department: string) => {
    const existing: { events: any[] } = (await axios.get(`https://waitlist-watcher.uk.r.appspot.com/raw/${department}/events`)).data;

    const [files] = await historical_bucket.getFiles({
        prefix: `${BUCKET_SNAPSHOT_PREFIX(department)}`
    });

    let prev: object = {};

    for (let i = 0; i < files.length; ++i) {
        const cur = JSON.parse((await files[i].download())[0].toString()) as CourseDataCourses;

        const parts = files[i].name.split('/');
        const date = parts[parts.length - 1].substring(0, parts[parts.length - 1].length - ".json".length);

        console.log(i, files[i].name)

        if (prev !== null) {
            const events = generateEvents(prev, cur, date);
            prev = cur;

            let expected = existing.events.find(e => e.data_time === date);
            if (expected) {
                let crc32c = new CRC32C();
                crc32c.update(Buffer.from(JSON.stringify(events)));

                if (expected.meta.crc32c === crc32c.toString()) {
                    console.log("skipped", date, "matching hashes")
                    continue;
                }
            }

            const firestoreSets = [];
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
            }
            await Promise.all(firestoreSets);
            await historical_bucket.file(BUCKET_EVENTS_PREFIX(department) + date + '.json').save(JSON.stringify(events));
            console.log("Uploaded events", i, date, events.length);
        }
    }
}

async function runForDepartmentWithRetries(dept: string) {
    for (let i = 0; i < 5; ++i) {
        try {
            await runForDepartment(dept);
            return;
        } catch (e) {
            console.error(e);
        }
    }
    throw Error("failed after 5 retries");
}

(async () => {
    let departments = ["AASP", "AAST", "AGNR", "AGST", "AMSC", "AMST", "ANSC", "ANTH", "AOSC", "ARAB", "ARCH", "AREC", "ARHU", "ARMY", "ARSC", "ARTH", "ARTT", "ASTR", "BCHM", "BIOE", "BIOI", "BIOL", "BIOM", "BIPH", "BISI", "BMGT", "BMSO", "BSCI", "BSCV", "BSGC", "BSOS", "BSST", "BUAC", "BUDT", "BUFN", "BULM", "BUMK", "BUSI", "BUSM", "BUSO", "CBMG", "CCJS", "CHBE", "CHEM", "CHIN", "CHPH", "CHSE", "CINE", "CLAS", "CLFS", "CMLT", "CMSC", "COMM", "CPBE", "CPET", "CPGH", "CPJT", "CPMS", "CPPL", "CPSA", "CPSD", "CPSF", "CPSG", "CPSN", "CPSP", "CPSS", "DANC", "DATA", "ECON", "EDCP", "EDHD", "EDHI", "EDMS", "EDSP", "EDUC", "ENAE", "ENBC", "ENCE", "ENCO", "ENEB", "ENEE", "ENES", "ENFP", "ENGL", "ENMA", "ENME", "ENPM", "ENRE", "ENSE", "ENSP", "ENST", "ENTM", "ENTS", "EPIB", "FGSM", "FIRE", "FMSC", "FREN", "GEMS", "GEOG", "GEOL", "GERM", "GREK", "GVPT", "HACS", "HDCC", "HEBR", "HESI", "HESP", "HGLO", "HHUM", "HISP", "HIST", "HLSA", "HLSC", "HLTH", "HNUH", "HONR", "IDEA", "IMDM", "IMMR", "INAG", "INFM", "INST", "ISRL", "ITAL", "JAPN", "JOUR", "JWST", "KNES", "KORA", "LACS", "LARC", "LATN", "LBSC", "LGBT", "LING", "MATH", "MEES", "MIEH", "MITH", "MLAW", "MLSC", "MOCB", "MSML", "MUED", "MUSC", "NACS", "NAVY", "NEUR", "NFSC", "NIAS", "PEER", "PERS", "PHIL", "PHPE", "PHSC", "PHYS", "PLCY", "PLSC", "PORT", "PSYC", "RDEV", "RELS", "RUSS", "SLAA", "SLLC", "SMLP", "SOCY", "SPAN", "SPHL", "STAT", "SURV", "TDPS", "THET", "TLPL", "TLTC", "UMEI", "UNIV", "URSP", "USLT", "VMSC", "WGSS", "WMST"];
    while (departments.length > 0) {
        await Promise.all(departments.splice(0, 20).map(runForDepartmentWithRetries))
        console.log(departments.length)
    }
})();

export default {};


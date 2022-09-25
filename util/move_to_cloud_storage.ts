import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {applyPatch} from "fast-json-patch/commonjs/core";
import {CourseDataCourses} from "../functions/src/types";

import {Storage} from "@google-cloud/storage";

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const BUCKET_SNAPSHOT_PREFIX = (department: string) => `snapshots/${department}/`

initializeApp();

const db = getFirestore();
db.settings({ignoreUndefinedProperties: true})

const course_data = db.collection('course_data');

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
    const data = await fetch_historical_data(department)
    const downloads = data.map(e => e.get());
    const uploads = [];

    let prev: object | null = {};
    for (let i = 0; i < data.length; ++i) {
        const curData = (await downloads[i]).data() as CourseDataHistoricalEntry;

        let cur: CourseDataCourses;
        try {
            cur = reconstructData(prev, curData);
        } catch (e) {
            // skip until next full snapshot
            console.log(department, "skipped", data[i].id);
            prev = null;
            continue;
        }

        let normalizedCur = normalizeData(cur);
        uploads.push(historical_bucket.file(BUCKET_SNAPSHOT_PREFIX(department) + data[i].id + '.json').save(JSON.stringify(normalizedCur)));
        console.log(department, "Uploaded snapshot", i, data[i].id);

        prev = cur;

    }
    await Promise.all(uploads);

    let deletions = []
    for (let i = 0; i < data.length; ++i) {
        console.log(department, "Deleted", i, data[i].id);
        deletions.push(data[i].delete())
    }

    await Promise.all(deletions);
}

(async () => {
    for (const department of ["AASP", "AAST", "AGNR", "AGST", "AMSC", "AMST", "ANSC", "ANTH", "AOSC", "ARAB", "ARCH", "AREC", "ARHU", "ARMY", "ARSC", "ARTH", "ARTT", "ASTR", "BCHM", "BIOE", "BIOI", "BIOL", "BIOM", "BIPH", "BISI", "BMGT", "BMSO", "BSCI", "BSCV", "BSGC", "BSOS", "BSST", "BUAC", "BUDT", "BUFN", "BULM", "BUMK", "BUSI", "BUSM", "BUSO", "CBMG", "CCJS", "CHBE", "CHEM", "CHIN", "CHPH", "CHSE", "CINE", "CLAS", "CLFS", "CMLT", "CMSC", "COMM", "CPBE", "CPET", "CPGH", "CPJT", "CPMS", "CPPL", "CPSA", "CPSD", "CPSF", "CPSG", "CPSN", "CPSP", "CPSS", "DANC", "DATA", "ECON", "EDCP", "EDHD", "EDHI", "EDMS", "EDSP", "EDUC", "ENAE", "ENBC", "ENCE", "ENCO", "ENEB", "ENEE", "ENES", "ENFP", "ENGL", "ENMA", "ENME", "ENPM", "ENRE", "ENSE", "ENSP", "ENST", "ENTM", "ENTS", "EPIB", "FGSM", "FIRE", "FMSC", "FREN", "GEMS", "GEOG", "GEOL", "GERM", "GREK", "GVPT", "HACS", "HDCC", "HEBR", "HESI", "HESP", "HGLO", "HHUM", "HISP", "HIST", "HLSA", "HLSC", "HLTH", "HNUH", "HONR", "IDEA", "IMDM", "IMMR", "INAG", "INFM", "INST", "ISRL", "ITAL", "JAPN", "JOUR", "JWST", "KNES", "KORA", "LACS", "LARC", "LATN", "LBSC", "LGBT", "LING", "MATH", "MEES", "MIEH", "MITH", "MLAW", "MLSC", "MOCB", "MSML", "MUED", "MUSC", "NACS", "NAVY", "NEUR", "NFSC", "NIAS", "PEER", "PERS", "PHIL", "PHPE", "PHSC", "PHYS", "PLCY", "PLSC", "PORT", "PSYC", "RDEV", "RELS", "RUSS", "SLAA", "SLLC", "SMLP", "SOCY", "SPAN", "SPHL", "STAT", "SURV", "TDPS", "THET", "TLPL", "TLTC", "UMEI", "UNIV", "URSP", "USLT", "VMSC", "WGSS", "WMST"]) {
        console.log(department)
        await runForDepartment(department);
    }
})();

export default {};

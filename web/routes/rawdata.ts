import type {FastifyInstance, FastifyPluginOptions} from "fastify";

import {File, Storage} from "@google-cloud/storage";

import NodeCache from "node-cache";
import {getFirestore} from "firebase-admin/firestore";

const cache = new NodeCache({useClones: false});

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const firestore = getFirestore();

const semesters = {
    "202208": {
        suffix: ''
    },
    "202301": {
        suffix: "202301"
    },
    "202308": {
        suffix: "202308"
    },
    "202401": {
        suffix: "202401"
    },
    "202408": {
        suffix: "202408"
    },
    "202501": {
        suffix: "202501"
    },
    "202508": {
        suffix: "202508"
    }
}

const validateSemester = (semester: string): semester is keyof typeof semesters => {
    return semester in semesters;
}

const fs_course_data_path = (semester: keyof typeof semesters) => {
    return 'course_data' + semesters[semester].suffix;
}

function constructFileResponse(file: File) {
    const parts = file.name.split('/');
    const date = parts[parts.length - 1].substring(0, parts[parts.length - 1].length - ".json".length);

    return {
        meta: {
            last_modified_date: file.metadata.updated,
            created_date: file.metadata.timeCreated,
            file_size: file.metadata.size,
            md5: file.metadata.md5Hash,
            crc32c: file.metadata.crc32c,
        },
        data_time: date,
        url: file.publicUrl()
    }
}

async function getDepartments(semester: keyof typeof semesters): Promise<Array<string>> {
    const cachedDepts = cache.get('departments' + semester);
    if (cachedDepts !== undefined) {
        return cachedDepts as Array<string>;
    }

    const documents = await firestore.collection(fs_course_data_path(semester)).listDocuments();

    const depts = documents.map(d => d.id);

    cache.set('departments', depts, 60 * 60);

    return depts;
}

type FileListingItem = {
    data_time: string;
    meta: {
        last_modified_date: string;
        created_date: string;
        file_size: any;
        md5: any
    };
    url: string
}

type FileListingResponse = {
    snapshots: FileListingItem[];
    department: string;
    events: FileListingItem[]
};

async function getFileListing(dept: string, semester: keyof typeof semesters): Promise<FileListingResponse> {
    const cachedResponse = cache.get(dept + semester);
    if (cachedResponse !== undefined) {
        return cachedResponse as FileListingResponse;
    }

    const [snapshotFiles] = await historical_bucket.getFiles({
        prefix: `${semester}/snapshots/${dept}/`,
    });

    const [eventFiles] = await historical_bucket.getFiles({
        prefix: `${semester}/events/${dept}/`,
    });

    const response = {
        semester: semester,
        department: dept,
        snapshots: snapshotFiles.map(constructFileResponse),
        events: eventFiles.map(constructFileResponse)
    };

    cache.set(dept + semester, response, 60 * 60 * 30);

    return response;
}

export const rawDataRoute = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
    fastify.get<{ Params: { dept: string } }>("/raw/cache_stats", async (request, reply) => {
        return cache.getStats();
    });

    fastify.get<{ Params: { semester: string } }>("/courses/:semester", async (request, reply) => {
        let {semester} = request.params;

        const cached = cache.get('courses' + semester);
        if (cached !== undefined) {
            return cached;
        }

        const coursesAndSections = (await (await firestore.doc('course_listing/' + semester)).get()).get("courses");

        cache.set('courses' + semester, coursesAndSections, 60 * 60);

        return coursesAndSections;
    });

    fastify.get<{ Params: { dept: string, semester: string } }>("/raw/:semester/:dept", async (request, reply) => {
        let {dept, semester} = request.params;
        dept = dept.toUpperCase();

        if (!validateSemester(semester)) {
            return {
                error: `Unknown semester: '${semester}'`,
                known_semesters: Object.keys(semesters)
            };
        }

        const departments = await getDepartments(semester);

        if (!departments.includes(dept)) {
            return {
                error: `Unknown department '${dept}'`,
                known_departments: departments
            };
        }

        return await getFileListing(dept, semester);
    });

    fastify.get<{ Params: { dept: string, semester: string } }>("/raw/:semester/:dept/snapshots", async (request, reply) => {
        let {dept, semester} = request.params;
        dept = dept.toUpperCase();

        if (!validateSemester(semester)) {
            return {
                error: `Unknown semester: '${semester}'`,
                known_semesters: Object.keys(semesters)
            };
        }

        const departments = await getDepartments(semester);

        if (!departments.includes(dept)) {
            return {
                error: `Unknown department '${dept}'`,
                known_departments: departments
            };
        }

        const snapshots = (await getFileListing(dept, semester)).snapshots;

        return {
            'department': dept,
            'snapshots': snapshots,
        };
    });

    fastify.get<{ Params: { dept: string, semester: string } }>("/raw/:semester/:dept/events", async (request, reply) => {
        let {dept, semester} = request.params;
        dept = dept.toUpperCase();

        if (!validateSemester(semester)) {
            return {
                error: `Unknown semester: '${semester}'`,
                known_semesters: Object.keys(semesters)
            };
        }

        const departments = await getDepartments(semester);

        if (!departments.includes(dept)) {
            return {
                error: `Unknown department '${dept}'`,
                known_departments: departments
            };
        }

        const events = (await getFileListing(dept, semester)).events;

        return {
            'department': dept,
            'events': events,
        };
    });
}

import type {FastifyInstance, FastifyPluginOptions} from "fastify";

import {File, Storage} from "@google-cloud/storage";

import NodeCache from "node-cache";
import {getFirestore} from "firebase-admin/firestore";

const cache = new NodeCache({useClones: false});

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const firestore = getFirestore();

const validateSemester = (semester: string): boolean => {
    return /^\d{6}$/.test(semester);
};

const fs_course_data_path = (semester: string) => {
    // Historical 202208 uses unsuffixed course_data; newer semesters use course_data{semester}.
    return semester === "202208" ? "course_data" : `course_data${semester}`;
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

async function getDepartments(semester: string): Promise<Array<string>> {
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

async function getFileListing(dept: string, semester: string): Promise<FileListingResponse> {
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
                known_semesters: "expected 6-digit semester code"
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
                known_semesters: "expected 6-digit semester code"
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
                known_semesters: "expected 6-digit semester code"
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

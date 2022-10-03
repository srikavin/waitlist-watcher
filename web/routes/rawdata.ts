import type {FastifyInstance, FastifyPluginOptions} from "fastify";

import {File, Storage} from "@google-cloud/storage";

import NodeCache from "node-cache";
import {getFirestore} from "firebase-admin/firestore";

const cache = new NodeCache({useClones: false});

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const firestore = getFirestore();

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

async function getDepartments(): Promise<Array<string>> {
    const cachedDepts = cache.get('departments');
    if (cachedDepts !== undefined) {
        return cachedDepts as Array<string>;
    }

    const documents = await firestore.collection('course_data').listDocuments();

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

async function getFileListing(dept: string): Promise<FileListingResponse> {
    const cachedResponse = cache.get(dept);
    if (cachedResponse !== undefined) {
        return cachedResponse as FileListingResponse;
    }

    const [snapshotFiles] = await historical_bucket.getFiles({
        prefix: `snapshots/${dept}/`,
    });

    const [eventFiles] = await historical_bucket.getFiles({
        prefix: `events/${dept}/`,
    });

    const response = {
        department: dept,
        snapshots: snapshotFiles.map(constructFileResponse),
        events: eventFiles.map(constructFileResponse)
    };

    cache.set(dept, response, 60 * 60 * 30);

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

        cache.set('courses', coursesAndSections, 60 * 60);

        return coursesAndSections;
    });

    fastify.get<{ Params: { dept: string } }>("/raw/:dept", async (request, reply) => {
        let {dept} = request.params;
        dept = dept.toUpperCase();

        const departments = await getDepartments();

        if (!departments.includes(dept)) {
            return {
                error: `Unknown department '${dept}'`,
                known_departments: departments
            };
        }

        return await getFileListing(dept);
    });

    fastify.get<{ Params: { dept: string } }>("/raw/:dept/snapshots", async (request, reply) => {
        let {dept} = request.params;
        dept = dept.toUpperCase();

        const departments = await getDepartments();

        if (!departments.includes(dept)) {
            return {
                error: `Unknown department '${dept}'`,
                known_departments: departments
            };
        }

        const snapshots = (await getFileListing(dept)).snapshots;

        return {
            'department': dept,
            'snapshots': snapshots,
        };
    });

    fastify.get<{ Params: { dept: string } }>("/raw/:dept/events", async (request, reply) => {
        let {dept} = request.params;
        dept = dept.toUpperCase();

        const departments = await getDepartments();

        if (!departments.includes(dept)) {
            return {
                error: `Unknown department '${dept}'`,
                known_departments: departments
            };
        }

        const events = (await getFileListing(dept)).events;

        return {
            'department': dept,
            'events': events,
        };
    });
}

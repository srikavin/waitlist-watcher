const {BigQuery} = require("@google-cloud/bigquery");
const {Storage} = require("@google-cloud/storage");

const TABLE_SCHEMA = [
    {name: "event_id", type: "STRING", mode: "REQUIRED"},
    {name: "timestamp", type: "TIMESTAMP", mode: "NULLABLE"},
    {name: "type", type: "STRING", mode: "REQUIRED"},
    {name: "course", type: "STRING", mode: "NULLABLE"},
    {name: "department", type: "STRING", mode: "NULLABLE"},
    {name: "title", type: "STRING", mode: "NULLABLE"},
    {name: "section", type: "STRING", mode: "NULLABLE"},
    {name: "semester", type: "STRING", mode: "NULLABLE"},
    {name: "old_value", type: "STRING", mode: "NULLABLE"},
    {name: "new_value", type: "STRING", mode: "NULLABLE"},
    {name: "scrape_event_id", type: "STRING", mode: "NULLABLE"},
    {name: "scrape_published_at", type: "TIMESTAMP", mode: "NULLABLE"},
];

const DEFAULT_FILE_CONCURRENCY = 64;
const DEFAULT_INSERT_CONCURRENCY = 40;
const DEFAULT_BATCH_SIZE = 8000;
const DEFAULT_BUCKET = "waitlist-watcher-historical-data";
const DEFAULT_DATASET = "waitlist_watcher_course_data";
const DEFAULT_TABLE = "events";

function parseArgs(argv) {
    const options = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (!arg.startsWith("--")) {
            continue;
        }

        if (next === undefined || next.startsWith("--")) {
            throw new Error(`Missing value for ${arg}`);
        }

        switch (arg) {
            case "--project-id":
                options.projectId = next;
                break;
            case "--bucket":
                options.bucket = next;
                break;
            case "--dataset":
                options.dataset = next;
                break;
            case "--table":
                options.table = next;
                break;
            case "--prefix":
                options.prefix = next;
                break;
            case "--semester":
                options.semester = next;
                break;
            case "--department":
                options.department = next.toUpperCase();
                break;
            case "--start-timestamp":
                options.startTimestamp = next;
                break;
            case "--end-timestamp":
                options.endTimestamp = next;
                break;
            case "--max-files":
                options.maxFiles = Number(next);
                if (!Number.isFinite(options.maxFiles)) {
                    throw new Error("--max-files must be a number");
                }
                break;
            case "--file-concurrency":
                options.fileConcurrency = Number(next);
                if (!Number.isFinite(options.fileConcurrency) || options.fileConcurrency <= 0) {
                    throw new Error("--file-concurrency must be a positive number");
                }
                break;
            case "--insert-concurrency":
                options.insertConcurrency = Number(next);
                if (!Number.isFinite(options.insertConcurrency) || options.insertConcurrency <= 0) {
                    throw new Error("--insert-concurrency must be a positive number");
                }
                break;
            case "--batch-size":
                options.batchSize = Number(next);
                if (!Number.isFinite(options.batchSize) || options.batchSize <= 0) {
                    throw new Error("--batch-size must be a positive number");
                }
                break;
            default:
                throw new Error(`Unknown arg: ${arg}`);
        }

        i += 1;
    }

    options.bucket = options.bucket || DEFAULT_BUCKET;
    options.dataset = options.dataset || DEFAULT_DATASET;
    options.table = options.table || DEFAULT_TABLE;

    return options;
}

function usage() {
    return [
        "Usage:",
        "  node ingest_events_to_bigquery.js \\",
        "    [--bucket waitlist-watcher-historical-data] \\",
        "    [--dataset waitlist_watcher_course_data] \\",
        "    [--table events] \\",
        "    [--project-id <gcp-project>] \\",
        "    [--semester 202601] \\",
        "    [--department CMSC] \\",
        "    [--prefix 202601/events/CMSC/] \\",
        "    [--start-timestamp 2026-01-01T00:00:00Z] \\",
        "    [--end-timestamp 2026-02-01T00:00:00Z] \\",
        "    [--max-files 500] \\",
        "    [--file-concurrency 8] \\",
        "    [--insert-concurrency 8] \\",
        "    [--batch-size 1000]",
        "",
        "Notes:",
        "  - Defaults: bucket=waitlist-watcher-historical-data, dataset=waitlist_watcher_course_data, table=events",
        "  - If --prefix is omitted, prefix is built from --semester/--department.",
        "  - Event files are expected to be JSON arrays at <semester>/events/<department>/<timestamp>.json.",
    ].join("\n");
}

function prefixFromOptions(options) {
    if (options.prefix) {
        return options.prefix;
    }

    if (!options.semester && !options.department) {
        return "";
    }

    if (!options.semester) {
        throw new Error("--semester is required when --department is provided");
    }

    if (options.department) {
        return `${options.semester}/events/${options.department}/`;
    }

    return `${options.semester}/events/`;
}

function toTimestampOrNull(input) {
    if (typeof input !== "string") {
        return null;
    }

    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
}

function extractFileTimestamp(name) {
    if (!name.endsWith(".json")) {
        return null;
    }
    const last = name.split("/").pop();
    if (!last) {
        return null;
    }
    return last.slice(0, -".json".length);
}

function inferDepartment(course, sourceObject) {
    if (typeof course === "string") {
        const byCourse = course.match(/^([A-Z]+)/);
        if (byCourse && byCourse[1]) {
            return byCourse[1];
        }
    }

    if (typeof sourceObject === "string") {
        const byPath = sourceObject.match(/(?:^|\/)events\/([^/]+)\//);
        if (byPath && byPath[1]) {
            return byPath[1].toUpperCase();
        }
    }

    return null;
}

function inferSemester(semester, sourceObject) {
    if (typeof semester === "string" && semester.trim().length > 0) {
        return semester;
    }

    if (typeof sourceObject === "string") {
        const byPath = sourceObject.match(/^(\d{6})\/events\//);
        if (byPath && byPath[1]) {
            return byPath[1];
        }
    }

    // Legacy backfill fallback: first historical semester in this project.
    return "202208";
}

async function ensureTable(bigquery, options) {
    const dataset = bigquery.dataset(options.dataset);
    await dataset.get({autoCreate: true});

    const table = dataset.table(options.table);
    const [exists] = await table.exists();
    if (!exists) {
        await table.create({
            schema: {
                fields: TABLE_SCHEMA
            },
            description: "Raw course events ingested from GCS event JSON files",
        });
        console.log(`Created table ${options.dataset}.${options.table}`);
    } else {
        const [metadata] = await table.getMetadata();
        const existingFields = (metadata.schema && metadata.schema.fields) || [];
        const existingNames = new Set(existingFields.map((f) => f.name));
        const missing = TABLE_SCHEMA.filter((f) => !existingNames.has(f.name));
        if (missing.length > 0) {
            await table.setMetadata({
                schema: {
                    fields: [...existingFields, ...missing]
                }
            });
            console.log(`Updated schema for ${options.dataset}.${options.table}; added: ${missing.map((f) => f.name).join(", ")}`);
        }
    }

    return table;
}

async function listEventFiles(storage, options, prefix) {
    const bucket = storage.bucket(options.bucket);
    const matched = [];

    let pageToken = undefined;
    do {
        const [files, nextQuery] = await bucket.getFiles({
            prefix,
            pageToken,
            autoPaginate: false,
        });

        for (const file of files) {
            const isEventFile = file.name.startsWith("events/") || file.name.includes("/events/");
            if (!isEventFile) {
                continue;
            }
            const timestamp = extractFileTimestamp(file.name);
            if (!timestamp) {
                continue;
            }

            if (options.startTimestamp && timestamp < options.startTimestamp) {
                continue;
            }
            if (options.endTimestamp && timestamp > options.endTimestamp) {
                continue;
            }

            matched.push({
                name: file.name,
                updated: file.metadata.updated,
                generation: file.metadata.generation,
            });
        }

        pageToken = nextQuery && nextQuery.pageToken;
    } while (pageToken);

    matched.sort((a, b) => a.name.localeCompare(b.name));
    if (options.maxFiles && matched.length > options.maxFiles) {
        return matched.slice(0, options.maxFiles);
    }
    return matched;
}

function createSemaphore(limit) {
    let active = 0;
    const waiting = [];

    return {
        async use(fn) {
            if (active >= limit) {
                await new Promise((resolve) => waiting.push(resolve));
            }

            active += 1;
            try {
                return await fn();
            } finally {
                active -= 1;
                const next = waiting.shift();
                if (next) {
                    next();
                }
            }
        }
    };
}

async function runWithConcurrency(items, concurrency, worker) {
    if (items.length === 0) {
        return;
    }

    let nextIndex = 0;
    const workerCount = Math.min(concurrency, items.length);
    const workers = [];

    for (let i = 0; i < workerCount; i++) {
        workers.push((async () => {
            while (true) {
                const index = nextIndex;
                nextIndex += 1;
                if (index >= items.length) {
                    return;
                }
                await worker(items[index], index);
            }
        })());
    }

    await Promise.all(workers);
}

async function insertBatch(table, rows) {
    if (rows.length === 0) {
        return;
    }

    try {
        await table.insert(rows, {
            ignoreUnknownValues: false,
            skipInvalidRows: true,
            raw: true,
        });
    } catch (err) {
        if (err && err.name === "PartialFailureError" && Array.isArray(err.errors)) {
            console.error(`PartialFailureError: ${err.errors.length} rows failed in this batch`);
            for (const failure of err.errors.slice(0, 10)) {
                const details = (failure.errors || [])
                    .map((e) => `${e.reason || "unknown"}: ${e.message || "no message"}`)
                    .join(" | ");
                const src = failure.row && failure.row.json ? `${failure.row.json.department || "unknown"}:${failure.row.json.course || "unknown"}` : "unknown_source";
                const eventId = failure.row && failure.row.json ? failure.row.json.event_id : "unknown_event_id";
                console.error(`  row source=${src} event_id=${eventId} -> ${details}`);
            }
            return;
        }
        throw err;
    }
}

function oldOrNewToString(value) {
    if (value === undefined) {
        return null;
    }
    if (value === null) {
        return "null";
    }
    if (typeof value === "string") {
        return value;
    }
    return JSON.stringify(value);
}

async function run() {
    const options = parseArgs(process.argv.slice(2));
    const prefix = prefixFromOptions(options);

    console.log(`Bucket: ${options.bucket}`);
    console.log(`Dataset.Table: ${options.dataset}.${options.table}`);
    console.log(`Prefix: ${prefix || "(all objects in bucket)"}`);
    const fileConcurrency = options.fileConcurrency || DEFAULT_FILE_CONCURRENCY;
    const insertConcurrency = options.insertConcurrency || DEFAULT_INSERT_CONCURRENCY;
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    console.log(`File concurrency: ${fileConcurrency}`);
    console.log(`Insert concurrency: ${insertConcurrency}`);
    console.log(`Batch size: ${batchSize}`);

    const bigquery = new BigQuery(options.projectId ? {projectId: options.projectId} : {});
    const storage = new Storage(options.projectId ? {projectId: options.projectId} : {});

    const table = await ensureTable(bigquery, options);
    const files = await listEventFiles(storage, options, prefix);
    console.log(`Found ${files.length} event files`);
    if (files.length === 0) {
        return;
    }

    const bucket = storage.bucket(options.bucket);
    let completedFiles = 0;
    let eventCount = 0;
    let failedFiles = 0;
    const insertSem = createSemaphore(insertConcurrency);

    await runWithConcurrency(files, fileConcurrency, async (fileMeta) => {
        const file = bucket.file(fileMeta.name);
        let parsed;
        try {
            const [contents] = await file.download();
            const raw = contents.toString("utf8");

            parsed = JSON.parse(raw);
        } catch (err) {
            failedFiles += 1;
            console.error(`Failed to parse JSON in ${fileMeta.name}: ${err.message}`);
            return;
        }

        if (!Array.isArray(parsed)) {
            failedFiles += 1;
            console.error(`Skipping non-array JSON in ${fileMeta.name}`);
            return;
        }

        const nowIso = new Date().toISOString();
        const fileTimestamp = toTimestampOrNull(fileMeta.updated) || nowIso;
        const rows = [];
        const insertPromises = [];

        for (let i = 0; i < parsed.length; i++) {
            const event = parsed[i];
            if (!event || typeof event !== "object") {
                continue;
            }

            const eventId = typeof event.id === "string" ? event.id : `${fileMeta.name}#${i}`;
            const eventTimestamp = toTimestampOrNull(event.timestamp);
            const scrapePublishedAt = eventTimestamp || fileTimestamp;

            rows.push({
                insertId: `${fileMeta.name}:${eventId}`,
                json: {
                    event_id: eventId,
                    timestamp: eventTimestamp,
                    type: typeof event.type === "string" ? event.type : "unknown",
                    course: typeof event.course === "string" ? event.course : null,
                    department: inferDepartment(event.course, fileMeta.name),
                    title: typeof event.title === "string" ? event.title : null,
                    section: typeof event.section === "string" ? event.section : null,
                    semester: inferSemester(event.semester, fileMeta.name),
                    old_value: oldOrNewToString(event.old),
                    new_value: oldOrNewToString(event.new),
                    scrape_event_id: eventId,
                    scrape_published_at: scrapePublishedAt,
                }
            });

            if (rows.length >= batchSize) {
                const batch = rows.splice(0, rows.length);
                insertPromises.push(insertSem.use(() => insertBatch(table, batch)));
            }
        }

        if (rows.length > 0) {
            const batch = rows.splice(0, rows.length);
            insertPromises.push(insertSem.use(() => insertBatch(table, batch)));
        }

        await Promise.all(insertPromises);

        completedFiles += 1;
        eventCount += parsed.length;
        if (completedFiles % 50 === 0 || completedFiles === files.length) {
            console.log(`[${completedFiles}/${files.length}] Processed files; total events seen=${eventCount}`);
        }
    });

    console.log(`Done. Ingested ${eventCount} events from ${completedFiles} files. Failed files: ${failedFiles}.`);
}

run().catch((err) => {
    console.error(err);
    console.error(`\n${usage()}`);
    process.exit(1);
});

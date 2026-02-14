const {BigQuery} = require("@google-cloud/bigquery");
const {Storage} = require("@google-cloud/storage");

const TABLE_SCHEMA = [
    {name: "snapshot_id", type: "STRING", mode: "REQUIRED"},
    {name: "timestamp", type: "TIMESTAMP", mode: "REQUIRED"},
    {name: "semester", type: "STRING", mode: "REQUIRED"},
    {name: "department", type: "STRING", mode: "REQUIRED"},
    {name: "course", type: "STRING", mode: "REQUIRED"},
    {name: "course_name", type: "STRING", mode: "NULLABLE"},
    {name: "course_description", type: "STRING", mode: "NULLABLE"},
    {name: "section", type: "STRING", mode: "REQUIRED"},
    {name: "instructor", type: "STRING", mode: "NULLABLE"},
    {name: "open_seats", type: "INT64", mode: "NULLABLE"},
    {name: "total_seats", type: "INT64", mode: "NULLABLE"},
    {name: "waitlist", type: "INT64", mode: "NULLABLE"},
    {name: "holdfile", type: "INT64", mode: "NULLABLE"},
    {name: "meetings_json", type: "JSON", mode: "NULLABLE"},
    {name: "scrape_event_id", type: "STRING", mode: "NULLABLE"},
    {name: "scrape_published_at", type: "TIMESTAMP", mode: "NULLABLE"},
];

const DEFAULT_FILE_CONCURRENCY = 48;
const DEFAULT_INSERT_CONCURRENCY = 24;
const DEFAULT_BATCH_SIZE = 4000;
const DEFAULT_BUCKET = "waitlist-watcher-historical-data";
const DEFAULT_DATASET = "waitlist_watcher_course_data";
const DEFAULT_TABLE = "snapshots";

function parseArgs(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (!arg.startsWith("--")) continue;
        if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for ${arg}`);
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
            case "--max-files":
                options.maxFiles = Number(next);
                break;
            case "--file-concurrency":
                options.fileConcurrency = Number(next);
                break;
            case "--insert-concurrency":
                options.insertConcurrency = Number(next);
                break;
            case "--batch-size":
                options.batchSize = Number(next);
                break;
            default:
                throw new Error(`Unknown arg: ${arg}`);
        }
        i += 1;
    }

    options.bucket = options.bucket || DEFAULT_BUCKET;
    options.dataset = options.dataset || DEFAULT_DATASET;
    options.table = options.table || DEFAULT_TABLE;
    options.fileConcurrency = options.fileConcurrency || DEFAULT_FILE_CONCURRENCY;
    options.insertConcurrency = options.insertConcurrency || DEFAULT_INSERT_CONCURRENCY;
    options.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    return options;
}

function prefixFromOptions(options) {
    if (options.prefix) return options.prefix;
    if (!options.semester && !options.department) return "";
    if (!options.semester) throw new Error("--semester is required when --department is provided");
    if (options.department) return `${options.semester}/snapshots/${options.department}/`;
    return `${options.semester}/snapshots/`;
}

function extractTimestamp(name) {
    const filename = name.split("/").pop();
    if (!filename || !filename.endsWith(".json")) return null;
    return filename.slice(0, -".json".length);
}

function inferSemester(sourceObject) {
    const m = sourceObject.match(/^(\d{6})\/snapshots\//);
    return m && m[1] ? m[1] : "202208";
}

function inferDepartment(sourceObject) {
    const m = sourceObject.match(/\/snapshots\/([^/]+)\//);
    return m && m[1] ? m[1].toUpperCase() : "UNKNOWN";
}

function createSemaphore(limit) {
    let active = 0;
    const waiting = [];
    return {
        async use(fn) {
            if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
            active += 1;
            try {
                return await fn();
            } finally {
                active -= 1;
                const next = waiting.shift();
                if (next) next();
            }
        }
    };
}

async function runWithConcurrency(items, concurrency, worker) {
    if (items.length === 0) return;
    let index = 0;
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, items.length); i++) {
        workers.push((async () => {
            while (true) {
                const cur = index++;
                if (cur >= items.length) return;
                await worker(items[cur], cur);
            }
        })());
    }
    await Promise.all(workers);
}

async function ensureTable(bigquery, options) {
    const dataset = bigquery.dataset(options.dataset);
    await dataset.get({autoCreate: true});
    const table = dataset.table(options.table);
    const [exists] = await table.exists();
    if (!exists) {
        await table.create({
            schema: {fields: TABLE_SCHEMA},
            description: "Flattened section-level snapshots from GCS snapshot JSON files",
            timePartitioning: {type: "DAY", field: "timestamp"},
            clustering: {fields: ["semester", "department", "course", "section"]},
        });
        return table;
    }

    const [metadata] = await table.getMetadata();
    const existingFields = (metadata.schema && metadata.schema.fields) || [];
    const existingNames = new Set(existingFields.map((f) => f.name));
    const missing = TABLE_SCHEMA.filter((f) => !existingNames.has(f.name));
    if (missing.length > 0) {
        await table.setMetadata({
            schema: {fields: [...existingFields, ...missing]},
        });
    }
    return table;
}

async function listSnapshotFiles(storage, options, prefix) {
    const bucket = storage.bucket(options.bucket);
    const out = [];
    let pageToken = undefined;
    do {
        const [files, nextQuery] = await bucket.getFiles({prefix, pageToken, autoPaginate: false});
        for (const file of files) {
            const isSnapshot = file.name.startsWith("snapshots/") || file.name.includes("/snapshots/");
            if (!isSnapshot) continue;
            if (!extractTimestamp(file.name)) continue;
            out.push({name: file.name, updated: file.metadata.updated});
        }
        pageToken = nextQuery && nextQuery.pageToken;
    } while (pageToken);
    out.sort((a, b) => a.name.localeCompare(b.name));
    if (options.maxFiles && out.length > options.maxFiles) return out.slice(0, options.maxFiles);
    return out;
}

async function insertBatch(table, rows) {
    if (rows.length === 0) return;
    try {
        await table.insert(rows, {raw: true, skipInvalidRows: true});
    } catch (err) {
        if (err && err.name === "PartialFailureError") return;
        throw err;
    }
}

async function run() {
    const options = parseArgs(process.argv.slice(2));
    const prefix = prefixFromOptions(options);

    const bigquery = new BigQuery(options.projectId ? {projectId: options.projectId} : {});
    const storage = new Storage(options.projectId ? {projectId: options.projectId} : {});
    const table = await ensureTable(bigquery, options);
    const files = await listSnapshotFiles(storage, options, prefix);
    if (files.length === 0) {
        console.log("No snapshot files found.");
        return;
    }

    const bucket = storage.bucket(options.bucket);
    const insertSem = createSemaphore(options.insertConcurrency);
    let completedFiles = 0;
    let failedFiles = 0;
    let insertedRows = 0;

    await runWithConcurrency(files, options.fileConcurrency, async (fileMeta) => {
        let snapshotObj;
        try {
            const [contents] = await bucket.file(fileMeta.name).download();
            snapshotObj = JSON.parse(contents.toString("utf8"));
            if (!snapshotObj || typeof snapshotObj !== "object" || Array.isArray(snapshotObj)) {
                throw new Error("expected JSON object");
            }
        } catch (err) {
            failedFiles += 1;
            console.error(`Failed ${fileMeta.name}: ${err.message}`);
            return;
        }

        const ts = extractTimestamp(fileMeta.name);
        const timestamp = ts ? new Date(ts).toISOString() : (fileMeta.updated || new Date().toISOString());
        const semester = inferSemester(fileMeta.name);
        const department = inferDepartment(fileMeta.name);
        const rows = [];

        for (const courseCode of Object.keys(snapshotObj)) {
            const course = snapshotObj[courseCode];
            if (!course || typeof course !== "object" || !course.sections) continue;
            const sections = course.sections;
            for (const sectionCode of Object.keys(sections)) {
                const section = sections[sectionCode];
                if (!section || typeof section !== "object") continue;
                const snapshotId = `${semester}:${department}:${timestamp}:${courseCode}:${sectionCode}`;
                rows.push({
                    insertId: `${fileMeta.name}:${courseCode}:${sectionCode}`,
                    json: {
                        snapshot_id: snapshotId,
                        timestamp,
                        semester,
                        department,
                        course: courseCode,
                        course_name: course.name || null,
                        course_description: course.description || null,
                        section: sectionCode,
                        instructor: section.instructor || null,
                        open_seats: Number.isFinite(section.openSeats) ? section.openSeats : null,
                        total_seats: Number.isFinite(section.totalSeats) ? section.totalSeats : null,
                        waitlist: Number.isFinite(section.waitlist) ? section.waitlist : null,
                        holdfile: Number.isFinite(section.holdfile) ? section.holdfile : null,
                        meetings_json: JSON.stringify(section.meetings || []),
                        scrape_event_id: null,
                        scrape_published_at: timestamp,
                    }
                });
            }
        }

        const insertPromises = [];
        for (let i = 0; i < rows.length; i += options.batchSize) {
            const batch = rows.slice(i, i + options.batchSize);
            insertPromises.push(insertSem.use(() => insertBatch(table, batch)));
        }
        await Promise.all(insertPromises);

        completedFiles += 1;
        insertedRows += rows.length;
        if (completedFiles % 50 === 0 || completedFiles === files.length) {
            console.log(`[${completedFiles}/${files.length}] files processed, rows=${insertedRows}`);
        }
    });

    console.log(`Done. files=${completedFiles}, failed=${failedFiles}, rows=${insertedRows}`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});


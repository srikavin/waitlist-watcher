const fs = require("fs");
const path = require("path");
const {BigQuery} = require("@google-cloud/bigquery");

const DEFAULT_PROJECT_ID = "waitlist-watcher";
const DEFAULT_DATASET = "waitlist_watcher_course_data";
const DEFAULT_TABLE = "events";
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../functions/src/config.json");

function parseArgs(argv) {
    const options = {
        projectId: DEFAULT_PROJECT_ID,
        dataset: DEFAULT_DATASET,
        table: DEFAULT_TABLE,
        configPath: DEFAULT_CONFIG_PATH,
        top4: 6,
        top3: 11,
        top2: 25,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) {
            continue;
        }

        if (arg === "--write") {
            options.write = true;
            continue;
        }

        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
            throw new Error(`Missing value for ${arg}`);
        }

        switch (arg) {
            case "--project-id":
                options.projectId = next;
                break;
            case "--dataset":
                options.dataset = next;
                break;
            case "--table":
                options.table = next;
                break;
            case "--semester":
                options.semester = next;
                break;
            case "--config":
                options.configPath = path.resolve(next);
                break;
            case "--top4":
                options.top4 = Number(next);
                break;
            case "--top3":
                options.top3 = Number(next);
                break;
            case "--top2":
                options.top2 = Number(next);
                break;
            default:
                throw new Error(`Unknown arg: ${arg}`);
        }

        i += 1;
    }

    for (const key of ["top4", "top3", "top2"]) {
        if (!Number.isFinite(options[key]) || options[key] < 0) {
            throw new Error(`--${key} must be a non-negative number`);
        }
    }
    if (!(options.top4 <= options.top3 && options.top3 <= options.top2)) {
        throw new Error("Expected top tiers to satisfy top4 <= top3 <= top2");
    }

    return options;
}

function usage() {
    return [
        "Usage:",
        "  node generate_prefix_weights.js [--semester 202608] [--write]",
        "    [--project-id waitlist-watcher]",
        "    [--dataset waitlist_watcher_course_data]",
        "    [--table events]",
        "    [--config ../functions/src/config.json]",
        "    [--top4 6] [--top3 11] [--top2 25]",
        "",
        "Notes:",
        "  - If --semester is omitted, the latest semester in the table is used.",
        "  - Weighting is rank-based:",
        "      rank <= top4 => 4",
        "      rank <= top3 => 3",
        "      rank <= top2 => 2",
        "      otherwise => 1",
        "  - --write updates prefix_weights in config.json.",
    ].join("\n");
}

function assignWeight(rank, options) {
    if (rank <= options.top4) {
        return 4;
    }
    if (rank <= options.top3) {
        return 3;
    }
    if (rank <= options.top2) {
        return 2;
    }
    return 1;
}

async function fetchDepartmentCounts(bigquery, options) {
    const targetTable = `\`${options.projectId}.${options.dataset}.${options.table}\``;
    const query = options.semester ? `
        SELECT department, COUNT(*) AS events
        FROM ${targetTable}
        WHERE semester = @semester
          AND department IS NOT NULL
          AND department != ""
        GROUP BY department
        ORDER BY events DESC, department ASC
    ` : `
        WITH latest AS (
          SELECT MAX(semester) AS semester
          FROM ${targetTable}
          WHERE semester IS NOT NULL AND semester != ""
        )
        SELECT e.department, COUNT(*) AS events
        FROM ${targetTable} e
        JOIN latest l ON e.semester = l.semester
        WHERE e.department IS NOT NULL
          AND e.department != ""
        GROUP BY e.department
        ORDER BY events DESC, e.department ASC
    `;

    const queryOptions = {
        query,
        params: options.semester ? {semester: options.semester} : {},
        useLegacySql: false,
    };

    const [rows] = await bigquery.query(queryOptions);
    return rows.map((row) => ({
        department: String(row.department).toUpperCase(),
        events: Number(row.events),
    }));
}

function buildWeights(rows, prefixes, options) {
    const byDepartment = new Map(rows.map((row) => [row.department, row.events]));
    const ranked = Array.from(byDepartment.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const weights = {};
    ranked.forEach(([department], idx) => {
        const weight = assignWeight(idx + 1, options);
        if (weight > 1) {
            weights[department] = weight;
        }
    });

    const unknownInConfig = ranked
        .map(([department]) => department)
        .filter((department) => !prefixes.includes(department));

    return {weights, ranked, unknownInConfig};
}

function writeConfig(configPath, prefixWeights) {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.prefix_weights = prefixWeights;
    fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function printSummary(ranked, weights, unknownInConfig, semesterLabel) {
    console.log(`Computed weights for semester ${semesterLabel}`);
    console.log(`Departments with boosted weight: ${Object.keys(weights).length}`);
    console.log("Top departments by events:");
    ranked.slice(0, 20).forEach(([department, events], idx) => {
        const weight = weights[department] ?? 1;
        console.log(`${String(idx + 1).padStart(2, " ")}. ${department} events=${events} weight=${weight}`);
    });
    if (unknownInConfig.length > 0) {
        console.warn(`Departments present in events but missing from prefixes: ${unknownInConfig.join(", ")}`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const bigquery = new BigQuery(options.projectId ? {projectId: options.projectId} : {});

    const config = JSON.parse(fs.readFileSync(options.configPath, "utf8"));
    const prefixes = Array.isArray(config.prefixes) ? config.prefixes : [];
    if (prefixes.length === 0) {
        throw new Error(`No prefixes found in ${options.configPath}`);
    }

    const rows = await fetchDepartmentCounts(bigquery, options);
    if (rows.length === 0) {
        throw new Error("No event rows found for weighting");
    }

    const {weights, ranked, unknownInConfig} = buildWeights(rows, prefixes, options);
    const semesterLabel = options.semester ?? "(latest)";
    printSummary(ranked, weights, unknownInConfig, semesterLabel);

    if (options.write) {
        writeConfig(options.configPath, weights);
        console.log(`Updated ${options.configPath} with prefix_weights`);
    } else {
        console.log("\nGenerated prefix_weights:");
        console.log(JSON.stringify(weights, null, 2));
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        console.error("\n" + usage());
        process.exit(1);
    });
}

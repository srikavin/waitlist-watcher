const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DEFAULT_SEMESTER = "202608";
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../common/config.json");

function parseArgs(argv) {
    const options = {
        semester: DEFAULT_SEMESTER,
        configPath: DEFAULT_CONFIG_PATH,
        writeConfig: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) {
            continue;
        }

        if (arg === "--write-config") {
            options.writeConfig = true;
            continue;
        }

        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
            throw new Error(`Missing value for ${arg}`);
        }

        switch (arg) {
            case "--semester":
                options.semester = next;
                break;
            case "--config":
                options.configPath = path.resolve(next);
                break;
            default:
                throw new Error(`Unknown arg: ${arg}`);
        }

        i += 1;
    }

    if (!/^\d{6}$/.test(options.semester)) {
        throw new Error("--semester must be in YYYYTT format, e.g. 202608");
    }

    return options;
}

function usage() {
    return [
        "Usage:",
        "  node fetch_prefixes_from_testudo.js [--semester 202608] [--write-config]",
        "    [--config ../common/config.json]",
        "",
        "Notes:",
        "  - Extracts prefixes from SOC course-prefix rows / links.",
        "  - Prints prefixes as JSON to stdout.",
        "  - --write-config replaces scraper.prefixes in common/config.json.",
    ].join("\n");
}

function getUrl(options) {
    return `https://app.testudo.umd.edu/soc/${options.semester}`;
}

function addMatches(prefixes, html, regex, groupIndex = 1) {
    let match = regex.exec(html);
    while (match) {
        const candidate = String(match[groupIndex] || "").toUpperCase();
        if (/^[A-Z]{3,8}$/.test(candidate)) {
            prefixes.add(candidate);
        }
        match = regex.exec(html);
    }
}

function extractPrefixesFromHtml(html, semester) {
    const prefixes = new Set();

    // Department tiles: <div id="VMSC" class="course-prefix row">
    addMatches(prefixes, html, /<div\s+id="([A-Z]{3,8})"\s+class="course-prefix\b[^"]*"/g);
    // Relative links used on SOC landing pages: href="202608/VMSC"
    addMatches(prefixes, html, new RegExp(`${semester}/([A-Z]{3,8})\\b`, "g"));

    return Array.from(prefixes).sort();
}

function updateConfigPrefixes(configPath, prefixes) {
    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw);
    config.scraper = config.scraper ?? {};
    config.scraper.prefixes = prefixes;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const url = getUrl(options);
    const html = String((await axios.get(url, {timeout: 30000})).data);

    const prefixes = extractPrefixesFromHtml(html, options.semester);
    if (prefixes.length === 0) {
        throw new Error(`No prefixes found at ${url}`);
    }

    if (options.writeConfig) {
        updateConfigPrefixes(options.configPath, prefixes);
        console.error(`Updated ${options.configPath} with ${prefixes.length} prefixes from ${url}`);
    }

    process.stdout.write(`${JSON.stringify(prefixes, null, 2)}\n`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        console.error(`\n${usage()}`);
        process.exit(1);
    });
}

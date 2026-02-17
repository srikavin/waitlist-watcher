const {getDatabase} = require("firebase-admin/database");
const {initializeApp} = require("firebase-admin/app");
const {writeFile} = require("fs/promises");

const SEMESTER_RE = /^\d{6}$/;
const DEFAULT_DATABASE_URL = "https://waitlist-watcher-default-rtdb.firebaseio.com";

function parseArgs(argv) {
    const options = {
        apply: false,
        deleteLegacy: false,
        databaseURL: DEFAULT_DATABASE_URL,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--apply") {
            options.apply = true;
            continue;
        }
        if (arg === "--delete-legacy") {
            options.deleteLegacy = true;
            continue;
        }
        if (arg === "--semester") {
            options.semester = argv[++i];
            continue;
        }
        if (arg === "--database-url") {
            options.databaseURL = argv[++i];
            continue;
        }
        if (arg === "--dry-run-output") {
            options.dryRunOutput = argv[++i];
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.semester || !SEMESTER_RE.test(options.semester)) {
        throw new Error("--semester is required in YYYYTT format, e.g. 202601");
    }

    return options;
}

function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSemesterKey(key) {
    return SEMESTER_RE.test(key);
}

async function run() {
    const options = parseArgs(process.argv.slice(2));

    initializeApp({
        databaseURL: options.databaseURL,
    });
    const db = getDatabase();

    const root = await db.ref("/").get();
    const rootVal = root.val() ?? {};

    const updates = {};

    let sectionRows = 0;
    let courseRows = 0;
    let departmentRows = 0;
    let everythingRows = 0;
    let userSettingsRows = 0;

    if (isRecord(rootVal.section_subscriptions)) {
        for (const [topKey, topVal] of Object.entries(rootVal.section_subscriptions)) {
            if (isSemesterKey(topKey) || !isRecord(topVal)) continue;
            for (const [section, sectionVal] of Object.entries(topVal)) {
                if (!isRecord(sectionVal)) continue;
                for (const [userId, channels] of Object.entries(sectionVal)) {
                    updates[`section_subscriptions/${options.semester}/${topKey}/${section}/${userId}`] = channels;
                    sectionRows++;
                }
            }
            if (options.deleteLegacy) {
                updates[`section_subscriptions/${topKey}`] = null;
            }
        }
    }

    if (isRecord(rootVal.course_subscriptions)) {
        for (const [topKey, topVal] of Object.entries(rootVal.course_subscriptions)) {
            if (isSemesterKey(topKey) || !isRecord(topVal)) continue;
            for (const [userId, channels] of Object.entries(topVal)) {
                updates[`course_subscriptions/${options.semester}/${topKey}/${userId}`] = channels;
                courseRows++;
            }
            if (options.deleteLegacy) {
                updates[`course_subscriptions/${topKey}`] = null;
            }
        }
    }

    if (isRecord(rootVal.department_subscriptions)) {
        for (const [topKey, topVal] of Object.entries(rootVal.department_subscriptions)) {
            if (isSemesterKey(topKey) || !isRecord(topVal)) continue;
            for (const [userId, channels] of Object.entries(topVal)) {
                updates[`department_subscriptions/${options.semester}/${topKey}/${userId}`] = channels;
                departmentRows++;
            }
            if (options.deleteLegacy) {
                updates[`department_subscriptions/${topKey}`] = null;
            }
        }
    }

    if (isRecord(rootVal.everything_subscriptions)) {
        for (const [topKey, topVal] of Object.entries(rootVal.everything_subscriptions)) {
            if (isSemesterKey(topKey)) continue;
            updates[`everything_subscriptions/${options.semester}/${topKey}`] = topVal;
            everythingRows++;
            if (options.deleteLegacy) {
                updates[`everything_subscriptions/${topKey}`] = null;
            }
        }
    }

    if (isRecord(rootVal.user_settings)) {
        for (const [userId, userSettings] of Object.entries(rootVal.user_settings)) {
            if (!isRecord(userSettings) || !isRecord(userSettings.subscriptions)) continue;
            for (const [subKey, channels] of Object.entries(userSettings.subscriptions)) {
                if (isSemesterKey(subKey)) continue;
                updates[`user_settings/${userId}/subscriptions/${options.semester}/${subKey}`] = channels;
                userSettingsRows++;
                if (options.deleteLegacy) {
                    updates[`user_settings/${userId}/subscriptions/${subKey}`] = null;
                }
            }
        }
    }

    const totalRows = sectionRows + courseRows + departmentRows + everythingRows + userSettingsRows;
    const summary = {
        semester: options.semester,
        apply: options.apply,
        deleteLegacy: options.deleteLegacy,
        sectionRows,
        courseRows,
        departmentRows,
        everythingRows,
        userSettingsRows,
        totalRows,
        updateKeys: Object.keys(updates).length,
    };

    console.log("RTDB subscription migration plan");
    console.log(`  semester: ${summary.semester}`);
    console.log(`  apply: ${summary.apply}`);
    console.log(`  delete legacy: ${summary.deleteLegacy}`);
    console.log(`  section rows: ${summary.sectionRows}`);
    console.log(`  course rows: ${summary.courseRows}`);
    console.log(`  department rows: ${summary.departmentRows}`);
    console.log(`  everything rows: ${summary.everythingRows}`);
    console.log(`  user_settings rows: ${summary.userSettingsRows}`);
    console.log(`  total rows: ${summary.totalRows}`);
    console.log(`  update keys: ${summary.updateKeys}`);

    if (!options.apply) {
        if (options.dryRunOutput) {
            await writeFile(options.dryRunOutput, JSON.stringify({summary, updates}, null, 2));
            console.log(`Dry run output written to ${options.dryRunOutput}`);
        }
        console.log("Dry run only. Re-run with --apply to execute.");
        return;
    }

    if (Object.keys(updates).length === 0) {
        console.log("No changes to apply.");
        return;
    }

    await db.ref("/").update(updates);
    console.log("Migration applied.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

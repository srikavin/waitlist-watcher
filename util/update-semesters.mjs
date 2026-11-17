import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const TERM_NAMES = {
    '01': 'Spring',
    '05': 'Summer',
    '08': 'Fall',
    '12': 'Winter',
};

const PRIMARY_TERM_CODES = new Set(['01', '08']);

export function extractTermIds(html) {
    const select = html.match(/<select\b[^>]*\bid=["']term-id-input["'][^>]*>([\s\S]*?)<\/select>/i);
    if (!select) throw new Error('Testudo term selector missing; keeping existing config');
    return [...select[1].matchAll(/<option\b[^>]*\bvalue=["'](\d{4}(?:01|05|08|12))["']/gi)]
        .map(match => match[1]).sort();
}

export function extractPrefixes(html, semester) {
    const prefixes = new Set();
    const addMatches = (regex) => {
        for (const match of html.matchAll(regex)) {
            const prefix = String(match[1] || '').toUpperCase();
            if (/^[A-Z]{3,8}$/.test(prefix)) prefixes.add(prefix);
        }
    };
    addMatches(/<div\s+id="([A-Z]{3,8})"\s+class="course-prefix\b[^"]*"/g);
    addMatches(new RegExp(`${semester}/([A-Z]{3,8})\\b`, 'g'));
    return [...prefixes].sort();
}

export function updateSemesters(config, html) {
    const ids = extractTermIds(html);
    const primaryIds = ids.filter(id => PRIMARY_TERM_CODES.has(id.slice(-2)));
    if (!primaryIds.length) throw new Error('No Spring/Fall terms found; keeping existing config');
    const latest = primaryIds.at(-1);
    if (latest < config.semesters.current) throw new Error('Term regression; keeping existing config');
    for (const id of ids) {
        if (!config.semesters.semesters.some(term => term.id === id)) {
            config.semesters.semesters.push({id, name: `${TERM_NAMES[id.slice(-2)]} ${id.slice(0, 4)}`, suffix: id});
        }
    }
    config.semesters.semesters.sort((a, b) => a.id.localeCompare(b.id));
    config.semesters.current = latest;
    return config;
}

export function updateSemesterPrefixes(config, semester, html) {
    const prefixes = extractPrefixes(html, semester);
    if (!prefixes.length) throw new Error(`No departments found for ${semester}; keeping existing config`);
    const term = config.semesters.semesters.find(candidate => candidate.id === semester);
    if (!term) throw new Error(`Unknown semester ${semester}`);
    term.prefixes = prefixes;
    return config;
}

export function firestoreIndexes(config) {
    return {indexes: [], fieldOverrides: config.semesters.semesters.flatMap(term => [
        {collectionGroup: `events${term.suffix}`, fieldPath: 'events', indexes: []},
        {collectionGroup: `course_data${term.suffix}`, fieldPath: 'latest', indexes: []},
    ])};
}

export async function runUpdate({
    dryRun = false,
    configPath = new URL('../common/config.json', import.meta.url),
    indexesPath = new URL('../firestore.indexes.json', import.meta.url),
    fetchHtml = async () => {
        const response = await fetch('https://app.testudo.umd.edu/soc/', {signal: AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`Testudo returned ${response.status}`);
        return response.text();
    },
    fetchSemesterHtml = async semester => {
        const response = await fetch(`https://app.testudo.umd.edu/soc/${semester}`, {signal: AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`Testudo returned ${response.status} for ${semester}`);
        return response.text();
    },
} = {}) {
    const previous = JSON.parse(readFileSync(configPath, 'utf8'));
    const rootHtml = await fetchHtml();
    const discoveredSemesterIds = extractTermIds(rootHtml);
    const config = updateSemesters(structuredClone(previous), rootHtml);
    await Promise.all(discoveredSemesterIds.map(async semester =>
        updateSemesterPrefixes(config, semester, await fetchSemesterHtml(semester))));
    const summary = {
        dryRun,
        previousSemester: previous.semesters.current,
        nextSemester: config.semesters.current,
        addedSemesters: config.semesters.semesters.filter(term => !previous.semesters.semesters.some(old => old.id === term.id)),
        updatedSemesterPrefixes: discoveredSemesterIds.filter(semester => {
            const previousTerm = previous.semesters.semesters.find(term => term.id === semester);
            const updatedTerm = config.semesters.semesters.find(term => term.id === semester);
            return JSON.stringify(previousTerm?.prefixes ?? []) !== JSON.stringify(updatedTerm?.prefixes ?? []);
        }),
        indexOverrides: firestoreIndexes(config).fieldOverrides.length,
    };
    if (!dryRun) {
        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        writeFileSync(indexesPath, JSON.stringify(firestoreIndexes(config), null, 2) + '\n');
    }
    return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Usage: node util/update-semesters.mjs [--dry-run]');
    console.log(JSON.stringify(await runUpdate({dryRun: process.argv.includes('--dry-run')}), null, 2));
}

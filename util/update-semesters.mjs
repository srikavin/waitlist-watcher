import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function updateSemesters(config, html) {
    const select = html.match(/<select\b[^>]*\bid=["']term-id-input["'][^>]*>([\s\S]*?)<\/select>/i);
    if (!select) throw new Error('Testudo term selector missing; keeping existing config');
    const ids = [...select[1].matchAll(/<option\b[^>]*\bvalue=["'](\d{4}(?:01|08))["']/gi)]
        .map(match => match[1]).sort();
    if (!ids.length) throw new Error('No Spring/Fall terms found; keeping existing config');
    const latest = ids.at(-1);
    if (latest < config.semesters.current) throw new Error('Term regression; keeping existing config');
    for (const id of ids) {
        if (!config.semesters.semesters.some(term => term.id === id)) {
            config.semesters.semesters.push({id, name: `${id.endsWith('01') ? 'Spring' : 'Fall'} ${id.slice(0, 4)}`, suffix: id});
        }
    }
    config.semesters.semesters.sort((a, b) => a.id.localeCompare(b.id));
    config.semesters.current = latest;
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
} = {}) {
    const previous = JSON.parse(readFileSync(configPath, 'utf8'));
    const config = updateSemesters(structuredClone(previous), await fetchHtml());
    const summary = {
        dryRun,
        previousSemester: previous.semesters.current,
        nextSemester: config.semesters.current,
        addedSemesters: config.semesters.semesters.filter(term => !previous.semesters.semesters.some(old => old.id === term.id)),
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

import {Storage} from "@google-cloud/storage";

const storage = new Storage();
const historical_bucket = storage.bucket('waitlist-watcher-historical-data')

const run = async (oldPrefix: string, prependPrefix: string) => {
    const [files] = await historical_bucket.getFiles({prefix: oldPrefix});
    for (const original of files) {
        const [data] = await original.download();

        console.log("Copying ", original.name, "to", prependPrefix + original.name);
        await historical_bucket.file(prependPrefix + original.name).save(data, {gzip: true});
        console.log("Deleting ", original.name);
        await original.delete();
    }
}

(async () => {
    await run("events/", "202208/");
    await run("snapshots/", "202208/");
})();

export default {};

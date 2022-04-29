const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const config = require("./config.json");

initializeApp();
const db = getFirestore();

const {scraper} = require("./scraper");

const BATCH_SIZE = 12;



exports.launcher = async (message, context) => {
    console.log("Scraper triggered");
    const triggerDataRef = db.collection("trigger_data").doc("state");

    let state = {
        prefixIndex: 0
    };
    const currentStateDoc = await triggerDataRef.get();
    if (currentStateDoc.exists) {
        state = currentStateDoc.data();
    }

    console.log("Scraping batch of size ", BATCH_SIZE, " at index ", state.prefixIndex);

    const prefixPromises = [];
    for (let i = 0; i < BATCH_SIZE; ++i) {
        const prefix = config.prefixes[(state.prefixIndex + i) % config.prefixes.length];
        prefixPromises.push(scraper(prefix, context))
        console.log("Started scraper for ", prefix);
    }

    state.prefixIndex = state.prefixIndex + BATCH_SIZE;

    console.log("Waiting for scraper completion");
    await Promise.all(prefixPromises);
    console.log("Scrapers finished");

    await triggerDataRef.set(state);
}

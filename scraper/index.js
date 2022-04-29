const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();

const config = require("./config.json");

const {scraper} = require("./scraper");

exports.launcher = async (message, context) => {
    let scraperPromise = Promise.all([]);

    await db.runTransaction(async t => {
        const triggerDataRef = db.collection("trigger_data").doc("state");

        let state = {
            prefixIndex: 0
        };

        const currentStateDoc = await triggerDataRef.get();
        if (currentStateDoc.exists) {
            state = currentStateDoc.data();
        }

        const BATCH_SIZE = 6;

        const prefixes = [];
        for (let i = 0; i < BATCH_SIZE; ++i) {
            prefixes.push(config.prefixes[(state.prefixIndex + i) % config.prefixes.length])
        }

        scraperPromise = scraper(prefixes, context);

        state.prefixIndex = state.prefixIndex + BATCH_SIZE;

        t.set(triggerDataRef, state);
    });

    await scraperPromise;
}

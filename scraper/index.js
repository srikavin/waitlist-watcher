const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const config = require("./config.json");

initializeApp();
const db = getFirestore();

const {scraper} = require("./scraper");

const BATCH_SIZE = 6;


exports.launcher = async (message, context) => {
    const triggerDataRef = db.collection("trigger_data").doc("state");

    let state = {
        prefixIndex: 0
    };
    const currentStateDoc = await triggerDataRef.get();
    if (currentStateDoc.exists) {
        state = currentStateDoc.data();
    }

    const prefixPromises = [];
    for (let i = 0; i < BATCH_SIZE; ++i) {
        prefixPromises.push(scraper(config.prefixes[(state.prefixIndex + i) % config.prefixes.length], context))
    }

    state.prefixIndex = state.prefixIndex + BATCH_SIZE;

    await Promise.all([
        triggerDataRef.set(state),
        Promise.all(prefixPromises)
    ]);
}

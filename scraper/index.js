const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {compare} = require("fast-json-patch");
const {PubSub} = require('@google-cloud/pubsub');

initializeApp();

const db = getFirestore();
const pubsub = new PubSub({projectId: "waitlist-watcher"});

const config = require("./config.json");

exports.scraper = require("./scraper.js").scraper;

exports.triggerer = async (message, context) => {
    const topic = pubsub.topic("scrape-prefix");

    const sendPubSub = async (prefix) => {
        console.log(prefix)

        const messageBuffer = Buffer.from(JSON.stringify(prefix), 'utf8');

        await topic.publish(messageBuffer);
    }

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

        await sendPubSub(prefixes);

        state.prefixIndex = state.prefixIndex + BATCH_SIZE;

        t.set(triggerDataRef, state);
    });
}

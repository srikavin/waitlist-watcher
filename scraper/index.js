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

        const messageBuffer = Buffer.from(prefix, 'utf8');

        await topic.publish(messageBuffer);
    }

    await db.runTransaction(async t => {
        const triggerDataRef = db.collection("trigger_data").doc("state");

        let state = {
            highFrequencyPrefixIndex: 0,
            prefixIndex: 0
        };

        const currentStateDoc = await triggerDataRef.get();
        if (currentStateDoc.exists) {
            state = currentStateDoc.data();
        }


        for (let i = 0; i < 4; ++i) {
            await sendPubSub(config.prefixes[(state.prefixIndex + i) % config.prefixes.length]);
        }

        await sendPubSub(config.high_frequency[(state.highFrequencyPrefixIndex + 1) % config.high_frequency.length]);

        state.prefixIndex = state.prefixIndex + 4;
        state.highFrequencyPrefixIndex = state.highFrequencyPrefixIndex + 1;

        t.set(triggerDataRef, state);
    });
}

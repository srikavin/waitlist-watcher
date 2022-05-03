const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const axios = require("axios");

initializeApp();

const db = getFirestore();

exports.notifier = async (message, context) => {
    const {prefix, previousState, newState, diff} = JSON.parse(Buffer.from(message.data, 'base64').toString());

    const userSettingsRef = db.collection("user_settings").doc("srikavin");

    const endpoints = await (await userSettingsRef.get()).data();

    await axios.get(endpoints.notifications.webhook);
}

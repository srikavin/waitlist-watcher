import {initializeApp} from "firebase-admin/app";
import {getDatabase} from "firebase-admin/database";
import {getFirestore} from "firebase-admin/firestore";
import {CloudTasksClient} from "@google-cloud/tasks";
import {Storage} from "@google-cloud/storage";
import {PubSub} from "@google-cloud/pubsub";

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

export const rtdb = getDatabase();
export const fsdb = getFirestore();
export const tasksClient = new CloudTasksClient();
export const pubsub = new PubSub({projectId: "waitlist-watcher"});
export const storage = new Storage({retryOptions: {autoRetry: true}});

export const updateTopic = pubsub.topic("prefix-update");
export const historical_bucket = storage.bucket('waitlist-watcher-historical-data')
export const discordWebhookQueue = tasksClient.queuePath("waitlist-watcher", "us-east4", "discord-webhook-queue")

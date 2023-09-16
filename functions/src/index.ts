import * as functions from "firebase-functions";
import {onNewCourse, onRemoveCourse} from "./course_listing";
import {onMessagePublished} from "firebase-functions/v2/pubsub";
import {sendNotifications} from "./notifier/notifier";
import {updateTopic} from "./common";
import {scraperLauncher} from "./scraper";
import {testNotify} from "./notifier/test_notify";
import {countWatchers} from './count_watchers';

export const onCourseAddition202401 =
    functions
        .region('us-east4')
        .runWith({memory: "128MB"})
        .firestore.document("events202401/{course_name}").onCreate(onNewCourse("202401"));

export const onCourseRemove202401 =
    functions
        .region('us-east4')
        .runWith({memory: "256MB"})
        .firestore.document("events202401/{course_name}").onDelete(onRemoveCourse("202401"));

export const notifierfunction = onMessagePublished({
    topic: updateTopic.name,
    memory: "256MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY", "SENDGRID_API_KEY"],
    region: "us-east1"
}, sendNotifications);

export const scraperfunction = onMessagePublished({
    topic: "scrape-launcher",
    memory: "512MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY"],
    region: "us-east1",
    maxInstances: 1,
    timeoutSeconds: 5 * 60
}, scraperLauncher);

export const test_notification =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "128MB",
            timeoutSeconds: 30,
            secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY", "SENDGRID_API_KEY"],
        })
        .https.onCall(testNotify);

export const count_watchers =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "128MB",
            timeoutSeconds: 30,
            maxInstances: 2
        })
        .https.onCall(countWatchers);
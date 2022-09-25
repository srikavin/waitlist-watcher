import * as functions from "firebase-functions";
import {onNewCourse, onRemoveCourse} from "./course_listing";
import {onMessagePublished} from "firebase-functions/v2/pubsub";
import {sendNotifications} from "./notifier/notifier";
import {updateTopic} from "./common";
import {scraperLauncher} from "./scraper";

export const onCourseAddition202208 =
    functions
        .region('us-east4')
        .runWith({memory: "128MB"})
        .firestore.document("events/{course_name}").onWrite(onNewCourse("202208"));

export const onCourseAddition202301 =
    functions
        .region('us-east4')
        .runWith({memory: "128MB"})
        .firestore.document("events202301/{course_name}").onWrite(onNewCourse("202301"));

export const onCourseRemove202208 =
    functions
        .region('us-east4')
        .runWith({memory: "128MB"})
        .firestore.document("events/{course_name}").onDelete(onRemoveCourse("202208"));

export const onCourseRemove202301 =
    functions
        .region('us-east4')
        .runWith({memory: "128MB"})
        .firestore.document("events202301/{course_name}").onDelete(onRemoveCourse("202301"));

export const notifierfunction = onMessagePublished({
    topic: updateTopic.name,
    memory: "256MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY"],
    region: "us-east1"
}, sendNotifications);

export const scraperfunction = onMessagePublished({
    topic: "scrape-launcher",
    memory: "256MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY"],
    region: "us-east1",
    maxInstances: 1,
    timeoutSeconds: 5 * 60
}, scraperLauncher);

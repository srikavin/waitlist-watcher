import {withScraperTelemetry} from "./telemetry";
import * as functions from "firebase-functions/v1";
import {onNewCourse, onRemoveCourse} from "./course_listing";
import {onMessagePublished} from "firebase-functions/v2/pubsub";
import {onRequest} from "firebase-functions/v2/https";
import {sendNotifications} from "./notifier/notifier";
import {updateTopic} from "./common";
import {scraperLauncher} from "./scraper";
import {testNotify} from "./notifier/test_notify";
import {countWatchers} from './count_watchers';
import {emailUnsubscribe} from "./email_unsubscribe";
import {streamEventsToLiveRtdb} from "./live_event_stream";
import {SEMESTER_DEFINITIONS} from "./common/config";

const dynamicExports = exports as Record<string, unknown>;

for (const semester of SEMESTER_DEFINITIONS) {
    const eventsCollection = `events${semester.suffix}/{course_name}`;

    dynamicExports[`onCourseAddition_${semester.id}`] =
        functions
            .region('us-east4')
            .runWith({memory: "128MB"})
            .firestore.document(eventsCollection).onCreate(onNewCourse(semester.id));

    dynamicExports[`onCourseRemove_${semester.id}`] =
        functions
            .region('us-east4')
            .runWith({memory: "256MB"})
            .firestore.document(eventsCollection).onDelete(onRemoveCourse(semester.id));
}

export const notifierfunction = onMessagePublished({
    topic: updateTopic.name,
    memory: "256MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY", "EMAIL_SECRET"],
    region: "us-east1"
}, sendNotifications);

export const scraperhttp = onRequest({
    invoker: "scraper-scheduler@waitlist-watcher.iam.gserviceaccount.com",
    memory: "512MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY"],
    region: "us-east1",
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 5 * 60
}, async (request, response) => {
    try {
        const result = await withScraperTelemetry(request, () => scraperLauncher(request));
        if (result.status === 405) response.set("Allow", "POST");
        response.status(result.status).send(result.body);
    } catch (error) {
        console.error("Scraper batch failed", error);
        response.status(500).send("Scraper batch failed");
    }
});

export const live_event_stream = onMessagePublished({
    topic: "events-ingest",
    memory: "256MiB",
    cpu: "gcf_gen1",
    region: "us-east1",
    maxInstances: 1,
}, streamEventsToLiveRtdb);

export const test_notification =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "128MB",
            timeoutSeconds: 30,
            secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY", "EMAIL_SECRET"],
        })
        .https.onCall(testNotify);


export const email_unsubscribe =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "128MB",
            timeoutSeconds: 30,
            maxInstances: 2
        })
        .https.onRequest(emailUnsubscribe);

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

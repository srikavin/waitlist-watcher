import * as functions from "firebase-functions/v1";
import {onMessagePublished} from "firebase-functions/v2/pubsub";
import {onRequest} from "firebase-functions/v2/https";
import {SEMESTER_DEFINITIONS} from "./common/config";

const dynamicExports = exports as Record<string, unknown>;

for (const semester of SEMESTER_DEFINITIONS) {
    const eventsCollection = `events${semester.suffix}/{course_name}`;

    dynamicExports[`onCourseAddition_${semester.id}`] =
        functions
            .region('us-east4')
            .runWith({memory: "256MB"})
            .firestore.document(eventsCollection).onCreate(async (snapshot, context) => {
                const {onNewCourse} = await import("./course_listing");
                return onNewCourse(semester.id)(snapshot, context);
            });

    dynamicExports[`onCourseRemove_${semester.id}`] =
        functions
            .region('us-east4')
            .runWith({memory: "256MB"})
            .firestore.document(eventsCollection).onDelete(async (snapshot, context) => {
                const {onRemoveCourse} = await import("./course_listing");
                return onRemoveCourse(semester.id)(snapshot, context);
            });
}

export const notifierfunction = onMessagePublished({
    topic: "prefix-update",
    memory: "256MiB",
    cpu: 'gcf_gen1',
    secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY", "EMAIL_SECRET"],
    region: "us-east1"
}, async event => {
    const {sendNotifications} = await import("./notifier/notifier");
    return sendNotifications(event);
});

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
        const {withScraperTelemetry} = await import("./telemetry");
        const result = await withScraperTelemetry(request, async () => {
            const {scraperLauncher} = await import("./scraper");
            return scraperLauncher(request);
        });
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
}, async event => {
    const {streamEventsToLiveRtdb} = await import("./live_event_stream");
    return streamEventsToLiveRtdb(event);
});

export const test_notification =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "256MB",
            timeoutSeconds: 30,
            secrets: ["DISCORD_CLIENT_SECRET", "VAPID_PRIV_KEY", "EMAIL_SECRET"],
        })
        .https.onCall(async (data, context) => {
            const {testNotify} = await import("./notifier/test_notify");
            return testNotify(data, context);
        });


export const email_unsubscribe =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "128MB",
            timeoutSeconds: 30,
            maxInstances: 2
        })
        .https.onRequest(async (request, response) => {
            const {emailUnsubscribe} = await import("./email_unsubscribe");
            return emailUnsubscribe(request, response);
        });

export const count_watchers =
    functions
        .region('us-east4')
        .runWith({
            invoker: "public",
            memory: "128MB",
            timeoutSeconds: 30,
            maxInstances: 2
        })
        .https.onCall(async (data, context) => {
            const {countWatchers} = await import("./count_watchers");
            return countWatchers(data, context);
        });

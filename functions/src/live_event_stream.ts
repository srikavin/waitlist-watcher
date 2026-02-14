import type {CloudEvent} from "firebase-functions/v2";
import type {MessagePublishedData} from "firebase-functions/v2/pubsub";
import {getDatabaseWithUrl} from "firebase-admin/database";

type IngestEventPayload = {
    event_id?: string;
    timestamp?: string;
    type?: string;
    course?: string;
    department?: string;
    title?: string;
    section?: string | null;
    semester?: string;
    old_value?: string | null;
    new_value?: string | null;
    scrape_event_id?: string;
    scrape_published_at?: string;
};

const LIVE_STREAM_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_SAMPLE_RATE = 0.02;
const LIVE_STREAM_RTDB_URL = "https://waitlist-watcher-live-events.firebaseio.com";

function parsePayload(event: CloudEvent<MessagePublishedData>): IngestEventPayload | null {
    const message = event.data?.message;
    if (!message) return null;
    if (message.json && typeof message.json === "object") {
        return message.json as IngestEventPayload;
    }
    if (!message.data) return null;
    try {
        const decoded = Buffer.from(message.data, "base64").toString("utf8");
        return JSON.parse(decoded) as IngestEventPayload;
    } catch (e) {
        console.error("Failed parsing live stream payload", e);
        return null;
    }
}

export async function streamEventsToLiveRtdb(event: CloudEvent<MessagePublishedData>) {
    const payload = parsePayload(event);
    if (!payload?.event_id || !payload?.semester || !payload?.course || !payload?.type || !payload?.timestamp) {
        return;
    }

    const nowMs = Date.now();
    const originalTimestampMs = Date.parse(payload.timestamp);
    const liveDb = getDatabaseWithUrl(LIVE_STREAM_RTDB_URL);
    const semesterRef = liveDb.ref(`live_event_stream/${payload.semester}`);
    const eventRef = semesterRef.child(`${nowMs}_${payload.event_id.slice(0, 12)}`);

    await eventRef.set({
        event_id: payload.event_id,
        // Live stream ordering/display should reflect ingestion/write time, not scrape batch time.
        timestamp: new Date(nowMs).toISOString(),
        timestamp_ms: nowMs,
        event_timestamp: payload.timestamp,
        event_timestamp_ms: Number.isFinite(originalTimestampMs) ? originalTimestampMs : null,
        semester: payload.semester,
        department: payload.department ?? null,
        course: payload.course,
        section: payload.section ?? null,
        type: payload.type,
        title: payload.title ?? null,
        old_value: payload.old_value ?? null,
        new_value: payload.new_value ?? null,
        scrape_event_id: payload.scrape_event_id ?? null,
        scrape_published_at: payload.scrape_published_at ?? null,
        streamed_at: new Date(nowMs).toISOString(),
    });

    if (Math.random() > CLEANUP_SAMPLE_RATE) {
        return;
    }

    const cutoffMs = nowMs - LIVE_STREAM_RETENTION_MS;
    const oldEventsSnapshot = await semesterRef
        .orderByChild("timestamp_ms")
        .endAt(cutoffMs)
        .limitToFirst(500)
        .get();

    if (!oldEventsSnapshot.exists()) {
        return;
    }

    const removals: Promise<void>[] = [];
    oldEventsSnapshot.forEach((child) => {
        removals.push(child.ref.remove());
    });
    await Promise.all(removals);
}

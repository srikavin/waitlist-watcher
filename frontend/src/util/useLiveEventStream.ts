import {useEffect, useMemo, useState} from "react";
import {limitToLast, onValue, orderByChild, query, ref} from "firebase/database";
import {live_realtime_db} from "@/frontend/src/firebase";

export type LiveStreamEvent = {
    event_id?: string;
    timestamp?: string;
    timestamp_ms?: number;
    semester?: string;
    department?: string | null;
    course?: string;
    section?: string | null;
    type?: string;
    title?: string | null;
    old_value?: string | null;
    new_value?: string | null;
    streamed_at?: string;
};

export function useLiveEventStream(semesterId: string, maxRows: number = 25) {
    const [loading, setLoading] = useState<boolean>(true);
    const [events, setEvents] = useState<LiveStreamEvent[]>([]);
    const [error, setError] = useState<string>();

    useEffect(() => {
        setLoading(true);
        setError(undefined);
        const q = query(
            ref(live_realtime_db, `live_event_stream/${semesterId}`),
            orderByChild("timestamp_ms"),
            limitToLast(maxRows),
        );

        const unsubscribe = onValue(q, (snapshot) => {
            const next: LiveStreamEvent[] = [];
            snapshot.forEach((child) => {
                next.push(child.val() as LiveStreamEvent);
            });
            next.sort((a, b) => Number(b.timestamp_ms ?? 0) - Number(a.timestamp_ms ?? 0));
            setEvents(next);
            setLoading(false);
        }, (e) => {
            setError(e.message);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [semesterId, maxRows]);

    return useMemo(() => ({
        loading,
        error,
        events,
    }), [loading, error, events]);
}

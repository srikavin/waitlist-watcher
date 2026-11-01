import {CourseEvent, SectionMeeting} from "@/common/events";

interface RecordedState {
    instructor?: string;
    open?: number;
    total?: number;
    waitlist?: number;
    holdfile?: number;
    meetings?: SectionMeeting[];
    removed: boolean;
    timestamp?: string;
}

export function deriveRecordedState(events: CourseEvent[]): RecordedState {
    let state: RecordedState = {removed: false};
    const priority = (event: CourseEvent) => event.type === 'section_added' ? 0
        : event.type === 'section_removed' || event.type === 'course_removed' ? 2 : 1;
    const ordered = [...events].filter(event => Number.isFinite(Date.parse(event.timestamp)))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || priority(a) - priority(b));
    const numberFields = {
        open_seats_changed: 'open',
        open_seat_available: 'open',
        total_seats_changed: 'total',
        waitlist_changed: 'waitlist',
        holdfile_changed: 'holdfile',
    } as const;

    for (const event of ordered) {
        if (event.type === 'section_added') state = {removed: false};
        if (event.type === 'section_removed' || event.type === 'course_removed') state.removed = true;
        state.timestamp = event.timestamp;
        if (!('new' in event)) continue;
        if (event.type === 'instructor_changed' && typeof event.new === 'string') {
            state.instructor = event.new;
        } else if (event.type === 'meeting_times_changed') {
            state.meetings = undefined;
            try {
                const meetings: unknown = JSON.parse(event.new);
                if (Array.isArray(meetings) && meetings.every(meeting =>
                    meeting !== null && typeof meeting === 'object' &&
                    ['days', 'start', 'end'].every(key => meeting[key] === undefined || typeof meeting[key] === 'string') &&
                    (meeting.location === undefined || (meeting.location !== null && typeof meeting.location === 'object' &&
                        ['buildingCode', 'classRoom', 'sectionText', 'elmsClassMessage'].every(key =>
                            meeting.location[key] === undefined || typeof meeting.location[key] === 'string'))))) {
                    state.meetings = meetings;
                }
            } catch {}
        } else if (event.type in numberFields) {
            const field = numberFields[event.type as keyof typeof numberFields];
            state[field] = typeof event.new === 'number' && Number.isFinite(event.new) ? event.new : undefined;
        }
    }
    return state;
}

export function LastRecordedState({events}: {events: CourseEvent[]}) {
    if (events.length === 0) return null;
    const state = deriveRecordedState(events);
    return (
        <section aria-label="Section details" className="mb-2 text-sm text-slate-600">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
                <div>
                    <dt className="sr-only">Meeting times</dt>
                    <dd className="space-y-1 text-sm text-slate-600">
                        {state.meetings === undefined ? 'Unavailable' : state.meetings.length === 0
                            ? 'No meeting times recorded' : state.meetings.map((meeting, index) => {
                                const time = [meeting.days, [meeting.start, meeting.end].filter(Boolean).join(' – ')].filter(Boolean).join(' · ');
                                const location = [meeting.location?.buildingCode, meeting.location?.classRoom,
                                    meeting.location?.sectionText, meeting.location?.elmsClassMessage].filter(Boolean).join(' ');
                                return <div key={index}>{[time, location].filter(Boolean).join(' · ') || 'Time and location unavailable'}</div>;
                            })}
                    </dd>
                </div>
            </dl>
        </section>
    );
}

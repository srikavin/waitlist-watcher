import {useEffect, useMemo, useRef, useState} from "react";
import {
    ChatIcon,
    CodeIcon,
    EnvelopeIcon,
    Icon,
    Link,
    MobilePhoneIcon,
    NotificationsIcon,
    TickCircleIcon
} from "evergreen-ui";
import {useTitle} from "../../util/useTitle";
import {HistoryScreen} from "../HistoryScreen/HistoryScreen";
import {NavLink, useNavigate} from "react-router-dom";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";
import {useBucketStats} from "@/frontend/src/util/useBucketStats";
import {LiveStreamEvent, useLiveEventStream} from "@/frontend/src/util/useLiveEventStream";
import styles from "./LandingPageScreen.module.css";

const SIGNAL_EVENT_TYPES = new Set([
    "open_seat_available",
    "open_seats_changed",
    "waitlist_changed",
    "holdfile_changed",
    "section_added",
    "section_removed",
    "course_added",
    "course_removed",
    "instructor_changed",
]);

function parseNumeric(value: string | null | undefined): number | null {
    if (value === undefined || value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toCourseCode(department: string, course: string): string {
    const normalizedDepartment = department.trim().toUpperCase();
    const normalizedCourse = course.trim().toUpperCase();
    return normalizedCourse.startsWith(normalizedDepartment)
        ? normalizedCourse
        : `${normalizedDepartment}${normalizedCourse}`;
}

function toSectionCode(department: string, course: string, section: string): string {
    return `${toCourseCode(department, course)}-${section.trim()}`;
}

function compactEventLabel(event: LiveStreamEvent): string {
    const oldNumber = parseNumeric(event.old_value);
    const newNumber = parseNumeric(event.new_value);
    switch (event.type) {
        case "open_seat_available":
            return "Seat Opened";
        case "open_seats_changed":
            if (oldNumber !== null && newNumber !== null) {
                const diff = newNumber - oldNumber;
                if (diff > 0) return `Open +${diff}`;
                if (diff < 0) return `Open ${diff}`;
            }
            return "Open Seats";
        case "waitlist_changed":
            if (oldNumber !== null && newNumber !== null) {
                const diff = newNumber - oldNumber;
                if (diff > 0) return `WL +${diff}`;
                if (diff < 0) return `WL ${diff}`;
            }
            return "Waitlist";
        case "holdfile_changed":
            if (oldNumber !== null && newNumber !== null) {
                const diff = newNumber - oldNumber;
                if (diff > 0) return `HF +${diff}`;
                if (diff < 0) return `HF ${diff}`;
            }
            return "Holdfile";
        case "section_added":
            return "Section Added";
        case "section_removed":
            return "Section Removed";
        case "course_added":
            return "Course Added";
        case "course_removed":
            return "Course Removed";
        case "instructor_changed":
            return "Instructor";
        default:
            return "Update";
    }
}

function eventAccentClass(type: string | undefined): string {
    switch (type) {
        case "open_seat_available":
        case "open_seats_changed":
            return "bg-emerald-100 text-emerald-800 border-emerald-200";
        case "waitlist_changed":
        case "holdfile_changed":
            return "bg-amber-100 text-amber-800 border-amber-200";
        case "section_removed":
        case "course_removed":
            return "bg-rose-100 text-rose-800 border-rose-200";
        case "section_added":
        case "course_added":
            return "bg-blue-100 text-blue-800 border-blue-200";
        default:
            return "bg-slate-100 text-slate-700 border-slate-200";
    }
}

function eventTargetPath(event: LiveStreamEvent): string | null {
    if (!event.department || !event.course) return null;
    if (event.section) {
        return `/history/${encodeURIComponent(toSectionCode(event.department, event.course, event.section))}`;
    }
    return `/history/${encodeURIComponent(toCourseCode(event.department, event.course))}`;
}

function eventRenderKey(event: LiveStreamEvent): string {
    return `${event.event_id ?? "evt"}-${event.timestamp_ms ?? 0}`;
}

function NotificationInfo(props: { icon: any, title: string, description: string }) {
    return (
        <div
            className="w-full justify-center flex flex-col bg-white/90 px-5 py-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-left">
                <div className="flex gap-3 items-center">
                    <div
                        className="place-self-center relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Icon icon={props.icon} size={20} color="info"/>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">{props.title}</h3>
                </div>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{props.description}</p>
            </div>
        </div>
    );
}

export function LandingPageScreen() {
    const {courseListing, semester} = useSemesterContext();
    const {overview, topCourses} = useBucketStats(semester.id);
    const {events: liveEvents, loading: liveLoading} = useLiveEventStream(semester.id, 40);
    const navigate = useNavigate();
    const [newEventKeys, setNewEventKeys] = useState<Set<string>>(new Set());
    const seenKeysRef = useRef<Set<string>>(new Set());

    const randomCourseName = useMemo(() => {
        if (courseListing.length === 0) {
            return "EMPTY";
        }
        let filteredCourseListings = courseListing.filter(x => x.includes('-'));

        return filteredCourseListings[Math.floor(Math.random() * filteredCourseListings.length)];
    }, [courseListing])

    useTitle("Waitlist Watcher");

    const topCourseChips = topCourses
        .filter(row => !row.period || row.period === "24h")
        .slice(0, 6);
    const formatInt = (value: number) => new Intl.NumberFormat().format(value);
    const courseCode = (department: string, course: string) => toCourseCode(department, course);
    const filteredLiveEvents = useMemo(() => {
        return liveEvents
            .filter((event) => SIGNAL_EVENT_TYPES.has(event.type ?? ""))
            .filter((event) => Boolean(event.department && event.course))
            .slice(0, 30);
    }, [liveEvents]);

    useEffect(() => {
        const currentKeys = filteredLiveEvents.map(eventRenderKey);
        const seenKeys = seenKeysRef.current;
        const freshKeys = currentKeys.filter((key) => !seenKeys.has(key));

        seenKeysRef.current = new Set(currentKeys);
        if (freshKeys.length === 0) {
            return;
        }

        setNewEventKeys((previous) => {
            const next = new Set(previous);
            for (const key of freshKeys) next.add(key);
            return next;
        });

        const timeout = window.setTimeout(() => {
            setNewEventKeys((previous) => {
                const next = new Set(previous);
                for (const key of freshKeys) next.delete(key);
                return next;
            });
        }, 1200);

        return () => window.clearTimeout(timeout);
    }, [filteredLiveEvents]);

    return (
        <>
            <section className="relative z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="pt-16 pb-24 md:pt-16 md:pb-32">
                        <div className="text-center pb-12 md:pb-16">
                            <h1 className="text-5xl md:text-6xl font-extrabold leading-tighter tracking-tighter mb-4 text-slate-900"
                                data-aos="zoom-y-out">Never miss an <span
                                className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-teal-400">open seat </span>
                                again.
                            </h1>
                            <div className="max-w-3xl mx-auto">
                                <p className="text-xl text-slate-600 mb-8" data-aos="zoom-y-out" data-aos-delay="150">
                                    Get notified of course and section removals, added sections, professor changes, seat
                                    availability, and view historical data.
                                </p>
                                <div className="max-w-xs mx-auto sm:max-w-none sm:flex sm:justify-center">
                                    <div>
                                        <NavLink to={"/login"}>
                                            <button
                                                className="btn text-white bg-blue-600 hover:bg-blue-700 w-full mb-4 sm:w-auto sm:mb-0 shadow-xl shadow-blue-200/60">
                                                Get Started
                                            </button>
                                        </NavLink>
                                    </div>
                                    <div>
                                        <NavLink to={"/departments"}>
                                            <button
                                                className="btn text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 w-full sm:w-auto sm:ml-4 shadow-sm">
                                                View Departments
                                            </button>
                                        </NavLink>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="relative flex justify-center flex-col w-10/12 mx-auto">
                            <div className="shadow-2xl shadow-slate-200/70">
                                <HistoryScreen name={randomCourseName} minimal landing={true}/>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="relative -mt-6">
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-12">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-lg p-6">
                        <div className="flex justify-between items-center gap-4 flex-wrap mb-4">
                            <h2 className="h3 text-slate-900">Live Overview</h2>
                            <NavLink to={"/stats"} className="text-sm font-semibold text-blue-600">View full stats</NavLink>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-slate-100 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Events</p>
                                <p className="text-xl font-semibold text-slate-900">{formatInt(overview?.events24h ?? 0)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-100 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Open Seat Alerts</p>
                                <p className="text-xl font-semibold text-slate-900">{formatInt(overview?.openSeatAlerts24h ?? 0)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-100 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Active Sections</p>
                                <p className="text-xl font-semibold text-slate-900">{formatInt(overview?.activeSections24h ?? 0)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-100 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Active Departments</p>
                                <p className="text-xl font-semibold text-slate-900">{formatInt(overview?.activeDepartments24h ?? 0)}</p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-sm text-slate-500 mb-2">Most active courses (24h)</p>
                            <div className="flex gap-2 flex-wrap">
                                {topCourseChips.map((row) => (
                                    <button
                                        key={`${row.department}-${row.course}`}
                                        type="button"
                                        onClick={() => navigate(`/history/${encodeURIComponent(courseCode(row.department, row.course))}`)}
                                        className="border border-red-200 bg-red-50 text-red-900 px-3 py-1 rounded-full text-sm"
                                    >
                                        {courseCode(row.department, row.course)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mt-6">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-sm text-slate-500">Recent Events</p>
                                <p className="text-xs text-slate-400">latest 30</p>
                            </div>
                            {liveLoading && filteredLiveEvents.length === 0 ? (
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                                    Loading live stream...
                                </div>
                            ) : filteredLiveEvents.length === 0 ? (
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                                    No recent events yet.
                                </div>
                            ) : (
                                <div className={styles.liveRailViewport}>
                                    <div className={styles.liveRailTrack}>
                                        {filteredLiveEvents.map((event) => {
                                            const key = eventRenderKey(event);
                                            const course = event.department && event.course ? toCourseCode(event.department, event.course) : "";
                                            const section = event.department && event.course && event.section ?
                                                toSectionCode(event.department, event.course, event.section) : null;
                                            const targetPath = eventTargetPath(event);
                                            const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : "";
                                            const label = compactEventLabel(event);
                                            const accentClass = eventAccentClass(event.type);
                                            const card = (
                                                <div className={`${styles.liveEventCard} ${newEventKeys.has(key) ? styles.liveEventNew : ""}`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${accentClass}`}>
                                                            {label}
                                                        </span>
                                                        <span className="text-[11px] text-slate-500">{time}</span>
                                                    </div>
                                                    <div className="mt-1 text-sm font-semibold text-slate-800">
                                                        {section ?? course}
                                                    </div>
                                                </div>
                                            );
                                            if (!targetPath) {
                                                return <div key={key}>{card}</div>;
                                            }
                                            return (
                                                <NavLink
                                                    key={key}
                                                    to={targetPath}
                                                    className={styles.liveEventLink}
                                                >
                                                    {card}
                                                </NavLink>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
            <section className="relative">
                <div className="absolute inset-0 bg-slate-50 pointer-events-none" aria-hidden="true"></div>
                <div className="h-36"></div>

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-12">
                    <div className="pt-12">
                        <div className="flex md:flex-row flex-col gap-6 md:gap-0">
                            <div className="w-full md:w-1/2 mr-8 place-self-center">

                                <div className="max-w-3xl mx-auto pb-3">
                                    <h1 className="h2 mb-4 text-slate-900">Get notified how you want.</h1>
                                    <p className="text-xl text-left text-slate-600">Receive real-time notifications for all course changes</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {["New Courses",
                                        "New Sections",
                                        "Removed Courses",
                                        "Removed Sections",
                                        "Course Name and Description Changes",
                                        "Section Meeting Time Changes",
                                        "Instructor Changes",
                                        "Seat Changes",
                                        "Waitlist and Holdfile Changes"].map(x =>
                                        (<span key={x}
                                               className="border border-blue-300 bg-blue-50/60 text-blue-900 px-3 py-1 rounded-full text-sm">
                                            {x}
                                        </span>)
                                    )}
                                </div>
                            </div>
                            <div className="md:w-8/12">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <NotificationInfo
                                        icon={<NotificationsIcon/>}
                                        title="Push Notifications"
                                        description="Get notified through your browser or phone using WebPush notifications."/>
                                    <NotificationInfo
                                        icon={<ChatIcon/>}
                                        title="Discord"
                                        description="Get course updates in Discord Servers or direct messages."/>
                                    <NotificationInfo
                                        icon={<CodeIcon/>}
                                        title="Web Hooks"
                                        description="Integrate with third-party apps using web hooks."/>
                                    <NotificationInfo
                                        icon={<MobilePhoneIcon/>}
                                        title="Text Message*"
                                        description="Get notified through real-time text message updates."/>
                                    <NotificationInfo
                                        icon={<EnvelopeIcon/>}
                                        title="Email*"
                                        description="Get notified through emails."/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="relative pt-12">
                <div
                    className="absolute inset-0 bg-gradient-to-b from-slate-100 via-white to-blue-50 pointer-events-none border-t border-b border-slate-100"
                    aria-hidden="true"></div>
                <div className="text-center relative max-w-6xl mx-auto px-4 sm:px-6 pb-12 gap-12">
                    <h2 className="h2 mb-4 text-slate-900">Plans</h2>

                    <div className="flex justify-center gap-12">
                        <div
                            className="w-72 p-6 bg-white shadow-xl shadow-blue-200/70 rounded-2xl border border-blue-200">
                            <p className="mb-4 text-xl font-medium text-slate-800">
                                Always Free
                            </p>
                            <p className="text-4xl font-bold text-slate-900">
                                $0
                                <span className="text-sm text-slate-400">/ semester</span>
                            </p>
                            <p className="mt-4 text-sm text-slate-600">
                                Core features will always be free.
                            </p>
                            <ul className="w-full mt-6 mb-6 text-sm text-slate-600">
                                {["No Watch Limit", "Real-time Notifications", "Push Notifications", "Discord Notifications", "Web Hook Notifications", "Email Notifications"].map(x => (
                                    <li className="mb-3 flex gap-2 items-center" key={x}>
                                        <Icon color="#10b981" size={24} icon={<TickCircleIcon/>}></Icon>
                                        {x}
                                    </li>
                                ))}
                            </ul>
                            <NavLink to={"/login"}>
                                <button type="button"
                                        className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 focus:ring-offset-indigo-200 text-white w-full transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
                                    Register
                                </button>
                            </NavLink>
                        </div>
                    </div>
                </div>
            </section>
            <section className="mt-12">
                <div className="text-center relative max-w-6xl mx-auto px-4 sm:px-6 pb-12">
                    <h1 className="h2 mb-4 text-slate-900">Raw Data and Source Code</h1>
                    <p className="text-xl text-center text-slate-600 mb-4">
                        Want to use the raw data for your own purposes or see how Waitlist Watcher works?
                    </p>
                    <p>
                        Get the
                        <Link size={600} target="_blank"
                              href={`https://waitlist-watcher.uk.r.appspot.com/raw/${semester.id}/CMSC/events`}> raw event
                            data </Link>
                        and
                        <Link size={600} target="_blank"
                              href={`https://waitlist-watcher.uk.r.appspot.com/raw/${semester.id}/CMSC/snapshots`}> course history
                            snapshots</Link>.
                        This project is open source on
                        <Link size={600} href="https://github.com/srikavin/waitlist-watcher"> Github.</Link>
                    </p>
                </div>
            </section>
        </>
    );
}

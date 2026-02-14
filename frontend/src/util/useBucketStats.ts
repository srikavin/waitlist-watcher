import {useEffect, useMemo, useState} from "react";

const bucketName = import.meta.env.VITE_STATS_BUCKET ?? "waitlist-watcher-scheduled-query-outputs";

export type TimePeriod = "24h" | "7d" | "semester";

type OverviewRow = {
    generated_at?: string;
    semester?: string;
    events_24h?: number | string;
    events_7d?: number | string;
    active_sections_24h?: number | string;
    open_seat_alerts_24h?: number | string;
    waitlist_drops_24h?: number | string;
    active_departments_24h?: number | string;
};

export type OverviewStats = {
    generatedAt: string;
    events24h: number;
    events7d: number;
    activeSections24h: number;
    openSeatAlerts24h: number;
    waitlistDrops24h: number;
    activeDepartments24h: number;
};

export type TopCourseRow = {
    semester: string;
    period: TimePeriod;
    department: string;
    course: string;
    events?: number | string;
    open_seat_alerts?: number | string;
    seat_churn?: number | string;
    waitlist_churn?: number | string;
};

export type WaitlistedCourseRow = {
    semester: string;
    department: string;
    course: string;
    total_waitlist?: number | string;
    sections?: number | string;
    max_section_waitlist?: number | string;
};

export type WaitlistedSectionRow = {
    semester: string;
    department: string;
    course: string;
    section: string;
    waitlist?: number | string;
    holdfile?: number | string;
    open_seats?: number | string;
    total_seats?: number | string;
    waitlist_ratio?: number | string;
};

export type FastestFillingSectionRow = {
    semester: string;
    period: TimePeriod;
    department: string;
    course: string;
    section: string;
    events?: number | string;
    seats_filled?: number | string;
    seat_churn?: number | string;
};

export type QuickestFilledSectionRow = {
    semester: string;
    department: string;
    course: string;
    section: string;
    quickest_minutes?: number | string;
    events?: number | string;
};

type StatsData = {
    loading: boolean;
    error?: string;
    overview?: OverviewStats;
    topCourses: TopCourseRow[];
    mostWaitlistedCourses: WaitlistedCourseRow[];
    mostWaitlistedSections: WaitlistedSectionRow[];
    fastestFillingSections: FastestFillingSectionRow[];
    quickestFilledSections: QuickestFilledSectionRow[];
};

function parseNumber(value: number | string | undefined): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

async function fetchExportJson<T>(objectPath: string): Promise<T[]> {
    const objectUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&ts=${Date.now()}`;
    const objectRes = await fetch(objectUrl, {cache: "no-store"});
    if (!objectRes.ok) {
        throw new Error(`Bucket object failed for ${objectPath}: ${objectRes.status}`);
    }

    const raw = await objectRes.text();
    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
    } catch {
        return trimmed
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => JSON.parse(line) as T);
    }
}

export function useBucketStats(semesterId: string): StatsData {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [overview, setOverview] = useState<OverviewStats>();
    const [topCourses, setTopCourses] = useState<TopCourseRow[]>([]);
    const [mostWaitlistedCourses, setMostWaitlistedCourses] = useState<WaitlistedCourseRow[]>([]);
    const [mostWaitlistedSections, setMostWaitlistedSections] = useState<WaitlistedSectionRow[]>([]);
    const [fastestFillingSections, setFastestFillingSections] = useState<FastestFillingSectionRow[]>([]);
    const [quickestFilledSections, setQuickestFilledSections] = useState<QuickestFilledSectionRow[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(undefined);
            try {
                const [overviewRows, topCourseRows, waitlistedRows, waitlistedSectionRows, fastestFillingSectionRows, quickestFilledSectionRows] = await Promise.all([
                    fetchExportJson<OverviewRow>("stats/overview/overview-000000000000.json"),
                    fetchExportJson<TopCourseRow>("stats/top_courses/top-courses-000000000000.json"),
                    fetchExportJson<WaitlistedCourseRow>("stats/most_waitlisted_courses/most-waitlisted-courses-000000000000.json"),
                    fetchExportJson<WaitlistedSectionRow>("stats/most_waitlisted_sections/most-waitlisted-sections-000000000000.json"),
                    fetchExportJson<FastestFillingSectionRow>("stats/fastest_filling_sections/fastest-filling-sections-000000000000.json"),
                    fetchExportJson<QuickestFilledSectionRow>("stats/quickest_filled_sections/quickest-filled-sections-000000000000.json"),
                ]);

                if (cancelled) return;

                const first = overviewRows.find(row => String(row.semester) === semesterId) ?? overviewRows[0];
                setOverview(first ? {
                    generatedAt: first.generated_at ?? "",
                    events24h: parseNumber(first.events_24h),
                    events7d: parseNumber(first.events_7d),
                    activeSections24h: parseNumber(first.active_sections_24h),
                    openSeatAlerts24h: parseNumber(first.open_seat_alerts_24h),
                    waitlistDrops24h: parseNumber(first.waitlist_drops_24h),
                    activeDepartments24h: parseNumber(first.active_departments_24h),
                } : undefined);

                setTopCourses(topCourseRows);
                setMostWaitlistedCourses(waitlistedRows);
                setMostWaitlistedSections(waitlistedSectionRows);
                setFastestFillingSections(fastestFillingSectionRows);
                setQuickestFilledSections(quickestFilledSectionRows);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "Failed to load stats");
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void load();
        const intervalId = window.setInterval(() => {
            void load();
        }, 60_000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [semesterId]);

    return useMemo(() => ({
        loading,
        error,
        overview,
        topCourses: topCourses
            .filter(row => String(row.semester) === semesterId)
            .sort((a, b) => parseNumber(b.events) - parseNumber(a.events)),
        mostWaitlistedCourses: mostWaitlistedCourses
            .filter(row => String(row.semester) === semesterId)
            .sort((a, b) => parseNumber(b.total_waitlist) - parseNumber(a.total_waitlist)),
        mostWaitlistedSections: mostWaitlistedSections
            .filter(row => String(row.semester) === semesterId)
            .sort((a, b) => parseNumber(b.waitlist) - parseNumber(a.waitlist)),
        fastestFillingSections: fastestFillingSections
            .filter(row => String(row.semester) === semesterId)
            .sort((a, b) => parseNumber(b.seats_filled) - parseNumber(a.seats_filled)),
        quickestFilledSections: quickestFilledSections
            .filter(row => String(row.semester) === semesterId)
            .sort((a, b) => parseNumber(a.quickest_minutes) - parseNumber(b.quickest_minutes)),
    }), [loading, error, overview, topCourses, mostWaitlistedCourses, mostWaitlistedSections, fastestFillingSections, quickestFilledSections, semesterId]);
}

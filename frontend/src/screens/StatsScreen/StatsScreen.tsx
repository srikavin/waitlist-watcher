import {Alert, Spinner} from "evergreen-ui";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";
import {TimePeriod, useBucketStats} from "@/frontend/src/util/useBucketStats";
import {useTitle} from "@/frontend/src/util/useTitle";
import {NavLink} from "react-router-dom";
import {useEffect, useMemo, useState} from "react";
import {ResponsiveContainer, Tooltip, Treemap} from "recharts";

function formatInt(value: number): string {
    return new Intl.NumberFormat().format(value);
}

function formatMinutesHuman(value: number): string {
    const minutes = Math.max(0, Math.floor(value));
    if (minutes < 60) return `${minutes}m`;
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const remMinutes = minutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
    return `${minutes}m`;
}

function parseNumber(value: number | string | undefined): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function formatGeneratedAt(value: string): string {
    const normalized = value.replace(" UTC", "Z").replace(" ", "T");
    const parsed = new Date(normalized);
    if (!Number.isFinite(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleString();
}

function mixChannel(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * t);
}

function heatColor(score: number): string {
    const norm = Math.max(0, Math.min(1, score));
    const low = [226, 232, 240];
    const high = [127, 29, 29];
    const r = mixChannel(low[0], high[0], norm);
    const g = mixChannel(low[1], high[1], norm);
    const b = mixChannel(low[2], high[2], norm);
    return `rgb(${r}, ${g}, ${b})`;
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
}

function TreemapHoverTooltip(props: any) {
    const {active, payload} = props ?? {};
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0]?.payload ?? {};
    const label = String(data.name ?? "");
    const waitlist = Number(data.waitlist ?? 0);
    const holdfile = Number(data.holdfile ?? 0);
    const openSeats = Number(data.open_seats ?? 0);
    const totalSeats = Number(data.total_seats ?? 0);
    const sectionCount = Number(data.section_count ?? 0);
    const pressure = Number(data.pressure ?? 0);
    const filledSeats = Math.max(0, Number(data.filled_seats ?? 0));

    return (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-md text-xs text-slate-700">
            <div className="font-semibold text-slate-900">{label}</div>
            <div>{`Waitlist: ${formatInt(waitlist)}`}</div>
            <div>{`Holdfile: ${formatInt(holdfile)}`}</div>
            <div>{`Pressure: ${(pressure * 100).toFixed(1)}%`}</div>
            <div>{`Filled seats: ${formatInt(filledSeats)}`}</div>
            {totalSeats > 0 ? <div>{`Seats: ${formatInt(openSeats)}/${formatInt(totalSeats)} open/total`}</div> : null}
            {sectionCount > 0 ? <div>{`Sections: ${formatInt(sectionCount)}`}</div> : null}
        </div>
    );
}

function TreemapLabelContent(props: any) {
    const {x, y, width, height, name, payload} = props ?? {};
    if (![x, y, width, height].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    if (width <= 1 || height <= 1) return null;

    const fill = String(payload?.fill ?? props?.fill ?? "#dbeafe");
    const rawLabel = String(name ?? payload?.name ?? "");
    const textColor = fill === "#b91c1c" ? "#ffffff" : "#0f172a";
    const fontSize = 13;
    const horizontalPadding = 8;
    const avgCharWidth = 7.2;
    const maxChars = Math.floor((width - horizontalPadding) / avgCharWidth);
    const canRender = height >= 16 && maxChars >= 4;
    const label = rawLabel.length > maxChars ? `…${rawLabel.slice(Math.max(0, rawLabel.length - (maxChars - 1)))}` : rawLabel;

    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#ffffff" strokeWidth={1}/>
            {canRender ? (
                <text
                    x={x + width / 2}
                    y={y + height / 2}
                    fill={textColor}
                    fontSize={fontSize}
                    fontWeight={600}
                    stroke="none"
                    textAnchor="middle"
                    dominantBaseline="middle"
                >
                    {label}
                </text>
            ) : null}
        </g>
    );
}

function TreemapNestIndexContent(props: any) {
    const label = String(props?.name ?? props?.payload?.name ?? "root");
    return <span>{label}</span>;
}

function sectionCode(department: string, course: string, section: string): string {
    const normalizedDepartment = department.trim().toUpperCase();
    const normalizedCourse = course.trim().toUpperCase();
    const courseWithDepartment = normalizedCourse.startsWith(normalizedDepartment)
        ? normalizedCourse
        : `${normalizedDepartment}${normalizedCourse}`;
    return `${courseWithDepartment}-${section.trim()}`;
}

function courseCode(department: string, course: string): string {
    const normalizedDepartment = department.trim().toUpperCase();
    const normalizedCourse = course.trim().toUpperCase();
    return normalizedCourse.startsWith(normalizedDepartment)
        ? normalizedCourse
        : `${normalizedDepartment}${normalizedCourse}`;
}

function courseTreemapLabel(department: string, course: string): string {
    const normalizedDepartment = department.trim().toUpperCase();
    const normalizedCourse = course.trim().toUpperCase();
    if (normalizedCourse.startsWith(normalizedDepartment)) {
        const stripped = normalizedCourse.slice(normalizedDepartment.length);
        return stripped || normalizedCourse;
    }
    return normalizedCourse;
}

function periodMetric(period: TimePeriod, values: { h24?: number; d7?: number; semester?: number }): number | undefined {
    if (period === "24h") return values.h24;
    if (period === "7d") return values.d7;
    return values.semester;
}

export function StatsScreen() {
    const {semester, semesters} = useSemesterContext();
    const {loading, error, overview, topCourses, mostWaitlistedCourses, mostWaitlistedSections, fastestFillingSections, quickestFilledSections} = useBucketStats(semester.id);
    const latestSemesterId = useMemo(
        () => Object.keys(semesters).sort((a, b) => Number(a) - Number(b)).at(-1) ?? semester.id,
        [semesters, semester.id],
    );
    const isPastSemester = Number(semester.id) < Number(latestSemesterId);
    const [period, setPeriod] = useState<TimePeriod>(isPastSemester ? "semester" : "24h");
    const [treemapHighlightMode, setTreemapHighlightMode] = useState<"pressure" | "filled">(
        isPastSemester ? "filled" : "pressure",
    );

    useTitle("Stats");

    useEffect(() => {
        setPeriod(isPastSemester ? "semester" : "24h");
    }, [semester.id, isPastSemester]);

    useEffect(() => {
        setTreemapHighlightMode(isPastSemester ? "filled" : "pressure");
    }, [semester.id, isPastSemester]);

    const treemapData = useMemo(() => {
        const departmentMap = new Map<string, Map<string, Array<{ section: string; waitlist: number; effective_waitlist: number; holdfile: number; pressure: number; open_seats: number; total_seats: number }>>>();
        for (const row of mostWaitlistedSections) {
            const department = row.department;
            const course = row.course;
            const section = row.section;
            const waitlist = Number(row.waitlist ?? 0);
            const holdfile = Number(row.holdfile ?? 0);
            const seats = Number(row.total_seats ?? 0);
            const openSeats = Number(row.open_seats ?? 0);
            const effectiveWaitlist = Math.max(0, waitlist - openSeats);
            const ratio = seats > 0 ? effectiveWaitlist / seats : 0;
            if (!department || !course || !section) continue;
            if (!departmentMap.has(department)) {
                departmentMap.set(department, new Map());
            }
            const courseMap = departmentMap.get(department)!;
            if (!courseMap.has(course)) {
                courseMap.set(course, []);
            }
            courseMap.get(course)!.push({
                section,
                waitlist,
                effective_waitlist: effectiveWaitlist,
                holdfile,
                pressure: ratio,
                open_seats: openSeats,
                total_seats: seats,
            });
        }

        const departmentsRaw = Array.from(departmentMap.entries()).map(([department, courses]) => {
            const coursesRaw = Array.from(courses.entries()).map(([course, sections]) => {
                const sectionNodes = sections.map((sectionRow) => ({
                    filled_ratio: sectionRow.total_seats > 0 ? Math.max(0, sectionRow.total_seats - sectionRow.open_seats) / sectionRow.total_seats : 0,
                    name: sectionCode(department, course, sectionRow.section),
                    size: Math.max(1, sectionRow.total_seats),
                    pressure: sectionRow.pressure,
                    filled_seats: Math.max(0, sectionRow.total_seats - sectionRow.open_seats),
                    waitlist: sectionRow.waitlist,
                    effective_waitlist: sectionRow.effective_waitlist,
                    holdfile: sectionRow.holdfile,
                    open_seats: sectionRow.open_seats,
                    total_seats: sectionRow.total_seats,
                    section_count: 1,
                    fill: "#cbd5e1",
                }));
                const courseWaitlist = sectionNodes.reduce((sum, node) => sum + Number(node.waitlist ?? 0), 0);
                const courseEffectiveWaitlist = sectionNodes.reduce((sum, node) => sum + Number(node.effective_waitlist ?? 0), 0);
                const courseHoldfile = sectionNodes.reduce((sum, node) => sum + Number(node.holdfile ?? 0), 0);
                const courseOpenSeats = sectionNodes.reduce((sum, node) => sum + Number(node.open_seats ?? 0), 0);
                const courseSeats = sectionNodes.reduce((sum, node) => sum + Number(node.total_seats ?? 0), 0);
                const courseFilledSeats = sectionNodes.reduce((sum, node) => sum + Number(node.filled_seats ?? 0), 0);
                const courseFilledRatio = courseSeats > 0 ? courseFilledSeats / courseSeats : 0;
                const coursePressure = courseSeats > 0 ? courseEffectiveWaitlist / courseSeats : 0;
                const courseSize = sectionNodes.reduce((sum, node) => sum + Number(node.size ?? 0), 0);
                const courseSectionCount = sectionNodes.reduce((sum, node) => sum + Number(node.section_count ?? 0), 0);
                return {
                    name: courseTreemapLabel(department, course),
                    size: Math.max(1, courseSize),
                    pressure: coursePressure,
                    filled_seats: courseFilledSeats,
                    filled_ratio: courseFilledRatio,
                    waitlist: courseWaitlist,
                    effective_waitlist: courseEffectiveWaitlist,
                    holdfile: courseHoldfile,
                    open_seats: courseOpenSeats,
                    total_seats: courseSeats,
                    section_count: courseSectionCount,
                    fill: "#cbd5e1",
                    children: sectionNodes,
                };
            });
            const departmentWaitlist = coursesRaw.reduce((sum, node) => sum + Number(node.waitlist ?? 0), 0);
            const departmentEffectiveWaitlist = coursesRaw.reduce((sum, node) => sum + Number(node.effective_waitlist ?? 0), 0);
            const departmentHoldfile = coursesRaw.reduce((sum, node) => sum + Number(node.holdfile ?? 0), 0);
            const departmentOpenSeats = coursesRaw.reduce((sum, node) => sum + Number(node.open_seats ?? 0), 0);
            const departmentSeats = coursesRaw.reduce((sum, node) => sum + Number(node.total_seats ?? 0), 0);
            const departmentFilledSeats = coursesRaw.reduce((sum, node) => sum + Number(node.filled_seats ?? 0), 0);
            const departmentFilledRatio = departmentSeats > 0 ? departmentFilledSeats / departmentSeats : 0;
            const departmentPressure = departmentSeats > 0 ? departmentEffectiveWaitlist / departmentSeats : 0;
            const departmentSize = coursesRaw.reduce((sum, node) => sum + Number(node.size ?? 0), 0);
            const departmentSectionCount = coursesRaw.reduce((sum, node) => sum + Number(node.section_count ?? 0), 0);
            return {
                name: department,
                size: Math.max(1, departmentSize),
                pressure: departmentPressure,
                filled_seats: departmentFilledSeats,
                filled_ratio: departmentFilledRatio,
                waitlist: departmentWaitlist,
                effective_waitlist: departmentEffectiveWaitlist,
                holdfile: departmentHoldfile,
                open_seats: departmentOpenSeats,
                total_seats: departmentSeats,
                section_count: departmentSectionCount,
                fill: "#cbd5e1",
                children: coursesRaw,
            };
        });

        const metricKey = treemapHighlightMode === "filled" ? "filled_ratio" : "pressure";
        const allMetricValues = [
            ...departmentsRaw.map((department) => Number(department[metricKey] ?? 0)),
            ...departmentsRaw.flatMap((department) => department.children.map((course) => Number(course[metricKey] ?? 0))),
            ...departmentsRaw.flatMap((department) =>
                department.children.flatMap((course) => course.children.map((section) => Number(section[metricKey] ?? 0))),
            ),
        ].filter((value) => Number.isFinite(value) && value >= 0);
        const p95Metric = percentile(allMetricValues, 0.95);
        const cappedMaxMetric = Math.max(Number.EPSILON, p95Metric);
        const colorScore = (metricValue: number) => {
            const normalized = Math.min(1, Math.max(0, metricValue / cappedMaxMetric));
            const logBase = 24;
            return Math.log1p(logBase * normalized) / Math.log1p(logBase);
        };

        return departmentsRaw.map((department) => ({
            ...department,
            fill: heatColor(colorScore(Number(department[metricKey] ?? 0))),
            children: department.children.map((course) => ({
                ...course,
                fill: heatColor(colorScore(Number(course[metricKey] ?? 0))),
                children: course.children.map((section) => ({
                    ...section,
                    fill: heatColor(colorScore(Number(section[metricKey] ?? 0))),
                })),
            })),
        }));
    }, [mostWaitlistedSections, treemapHighlightMode]);

    if (loading) {
        return (
            <div className="w-full flex justify-center py-12">
                <Spinner/>
            </div>
        );
    }

    if (error) {
        return <Alert intent="danger" title="Failed to load stats" marginTop={12}>{error}</Alert>;
    }

    const inSelectedPeriod = (rowPeriod: TimePeriod | undefined) => !!rowPeriod && rowPeriod === period;
    const topActiveCourses = topCourses.filter((row) => inSelectedPeriod(row.period)).slice(0, 15);
    const fastestFillingSectionsInPeriod = [...fastestFillingSections]
        .filter((row) => inSelectedPeriod(row.period))
        .filter((row) => parseNumber(row.seats_filled) > 0)
        .sort((a, b) => parseNumber(b.seats_filled) - parseNumber(a.seats_filled))
        .slice(0, 15);
    const quickestFilledSectionsAll = [...quickestFilledSections]
        .filter((row) => parseNumber(row.quickest_minutes) >= 0)
        .sort((a, b) => parseNumber(a.quickest_minutes) - parseNumber(b.quickest_minutes))
        .slice(0, 15);
    const topWaitlisted = mostWaitlistedCourses.slice(0, 15);
    const topWaitlistedSections = mostWaitlistedSections.slice(0, 15);
    const eventsByPeriod = periodMetric(period, {
        h24: overview?.events24h,
        d7: overview?.events7d,
        semester: overview?.eventsSemester,
    });
    const openSeatAlertsByPeriod = periodMetric(period, {
        h24: overview?.openSeatAlerts24h,
        d7: overview?.openSeatAlerts7d,
        semester: overview?.openSeatAlertsSemester,
    });
    const activeSectionsByPeriod = periodMetric(period, {
        h24: overview?.activeSections24h,
        d7: overview?.activeSections7d,
        semester: overview?.activeSectionsSemester,
    });
    const activeDepartmentsByPeriod = periodMetric(period, {
        h24: overview?.activeDepartments24h,
        d7: overview?.activeDepartments7d,
        semester: overview?.activeDepartmentsSemester,
    });

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h2 text-slate-900">Stats</h1>
                    <p className="text-slate-600">{semester.name}</p>
                </div>
                {overview?.generatedAt ? (
                    <p className="text-sm text-slate-500">Generated {formatGeneratedAt(overview.generatedAt)}</p>
                ) : null}
            </div>

            <section className="space-y-4">
                <div className="grid lg:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
                    <style>
                        {`
                        .recharts-treemap-nest-index-wrapper {
                            margin-top: 10px !important;
                            text-align: center !important;
                        }
                        .recharts-treemap-nest-index-box {
                            background: transparent !important;
                            color: #334155 !important;
                            border: 0 !important;
                            border-radius: 0 !important;
                            font-size: 12px !important;
                            font-weight: 600 !important;
                            line-height: 1.2 !important;
                            padding: 0 !important;
                            margin-right: 8px !important;
                            display: inline-flex !important;
                            align-items: center !important;
                        }
                        .recharts-treemap-nest-index-box::after {
                            content: "›";
                            color: #94a3b8;
                            margin-left: 8px;
                            font-weight: 500;
                        }
                        .recharts-treemap-nest-index-box:last-child::after {
                            content: "";
                            margin-left: 0;
                        }
                        `}
                    </style>
                    <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold text-slate-900">Treemap</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-slate-500">Highlight</span>
                            {([
                                {id: "filled", label: "Filled seats"},
                                {id: "pressure", label: "Waitlist pressure"},
                            ] as const).map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setTreemapHighlightMode(option.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs border ${treemapHighlightMode === option.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300"}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-[420px]">
                        {treemapData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                No waitlist section data yet.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={treemapData}
                                dataKey="size"
                                type="nest"
                                nameKey="name"
                                stroke="#ffffff"
                                fill="#dbeafe"
                                isAnimationActive={false}
                                nestIndexContent={TreemapNestIndexContent}
                                content={<TreemapLabelContent/>}
                            >
                                <Tooltip content={<TreemapHoverTooltip/>}/>
                            </Treemap>
                        </ResponsiveContainer>
                    )}
                    </div>
                    <div className="mt-2 flex items-center justify-start gap-2 text-xs text-slate-500">
                        <span>{treemapHighlightMode === "filled" ? "Filled seats:" : "Pressure:"}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700">Low</span>
                        <span className="px-2 py-0.5 rounded bg-orange-400 text-white">Medium</span>
                        <span className="px-2 py-0.5 rounded bg-red-800 text-white">High</span>
                    </div>
                </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Most Waitlisted Courses</h2>
                    <div className="overflow-auto rounded-lg border border-slate-100">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
                                <th className="px-3 py-2 pr-2">Course</th>
                                <th className="px-3 py-2 pr-2 text-right">Total Waitlist</th>
                                <th className="px-3 py-2 text-right">Sections</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topWaitlisted.map((row) => (
                                <tr key={`${row.semester}-${row.department}-${row.course}`} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors">
                                    <td className="px-3 py-2.5 pr-2 text-slate-700">
                                        <NavLink className="text-slate-800 hover:text-blue-700 no-underline hover:underline decoration-slate-300" to={`/history/${encodeURIComponent(courseCode(row.department, row.course))}`}>
                                            {courseCode(row.department, row.course)}
                                        </NavLink>
                                    </td>
                                    <td className="px-3 py-2.5 pr-2 text-slate-600 text-right tabular-nums">{formatInt(Number(row.total_waitlist ?? 0))}</td>
                                    <td className="px-3 py-2.5 text-slate-600 text-right tabular-nums">{formatInt(Number(row.sections ?? 0))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Most Waitlisted Sections</h2>
                    <div className="overflow-auto rounded-lg border border-slate-100">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
                                <th className="px-3 py-2 pr-2">Section</th>
                                <th className="px-3 py-2 pr-2 text-right">Waitlist</th>
                                <th className="px-3 py-2 text-right">Seats</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topWaitlistedSections.map((row) => (
                                <tr key={`${row.semester}-${row.department}-${row.course}-${row.section}`} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors">
                                    <td className="px-3 py-2.5 pr-2 text-slate-700">
                                        <NavLink className="text-slate-800 hover:text-blue-700 no-underline hover:underline decoration-slate-300" to={`/history/${encodeURIComponent(sectionCode(row.department, row.course, row.section))}`}>
                                            {sectionCode(row.department, row.course, row.section)}
                                        </NavLink>
                                    </td>
                                    <td className="px-3 py-2.5 pr-2 text-slate-600 text-right tabular-nums">{formatInt(Number(row.waitlist ?? 0))}</td>
                                    <td className="px-3 py-2.5 text-slate-600 text-right tabular-nums">{formatInt(Number(row.open_seats ?? 0))}/{formatInt(Number(row.total_seats ?? 0))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Activity Over Time</h2>
                <div className="flex items-center gap-3 flex-wrap">
                    {(["24h", "7d", "semester"] as TimePeriod[]).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setPeriod(option)}
                            className={`px-4 py-2 rounded-full text-sm border ${period === option ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300"}`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{`Events (${period})`}</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {eventsByPeriod === undefined ? "—" : formatInt(eventsByPeriod)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{`Open Seat Alerts (${period})`}</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {openSeatAlertsByPeriod === undefined ? "—" : formatInt(openSeatAlertsByPeriod)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{`Active Sections (${period})`}</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {activeSectionsByPeriod === undefined ? "—" : formatInt(activeSectionsByPeriod)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{`Active Departments (${period})`}</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {activeDepartmentsByPeriod === undefined ? "—" : formatInt(activeDepartmentsByPeriod)}
                        </p>
                    </div>
                </div>
                <div className="grid lg:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <h2 className="text-lg font-semibold text-slate-900 mb-3">Most Active Courses ({period})</h2>
                        <div className="overflow-auto rounded-lg border border-slate-100">
                            <table className="w-full text-sm">
                                <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
                                    <th className="px-3 py-2 pr-2">Course</th>
                                    <th className="px-3 py-2 pr-2 text-right">Events</th>
                                    <th className="px-3 py-2 text-right">Seat Churn</th>
                                </tr>
                                </thead>
                                <tbody>
                                {topActiveCourses.map((row) => (
                                    <tr key={`${row.semester}-${row.period}-${row.department}-${row.course}`} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors">
                                        <td className="px-3 py-2.5 pr-2 text-slate-700">
                                            <NavLink className="text-slate-800 hover:text-blue-700 no-underline hover:underline decoration-slate-300" to={`/history/${encodeURIComponent(courseCode(row.department, row.course))}`}>
                                                {courseCode(row.department, row.course)}
                                            </NavLink>
                                        </td>
                                        <td className="px-3 py-2.5 pr-2 text-slate-600 text-right tabular-nums">{formatInt(Number(row.events ?? 0))}</td>
                                        <td className="px-3 py-2.5 text-slate-600 text-right tabular-nums">{formatInt(Number(row.seat_churn ?? 0))}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <h2 className="text-lg font-semibold text-slate-900 mb-3">Fastest Filling Sections ({period})</h2>
                        <div className="overflow-auto rounded-lg border border-slate-100">
                            <table className="w-full text-sm">
                                <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
                                    <th className="px-3 py-2 pr-2">Section</th>
                                    <th className="px-3 py-2 pr-2 text-right">Seats Filled</th>
                                </tr>
                                </thead>
                                <tbody>
                                {fastestFillingSectionsInPeriod.map((row) => (
                                    <tr key={`fillsec-${row.semester}-${row.period}-${row.department}-${row.course}-${row.section}`} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors">
                                        <td className="px-3 py-2.5 pr-2 text-slate-700">
                                            <NavLink className="text-slate-800 hover:text-blue-700 no-underline hover:underline decoration-slate-300" to={`/history/${encodeURIComponent(sectionCode(row.department, row.course, row.section))}`}>
                                                {sectionCode(row.department, row.course, row.section)}
                                            </NavLink>
                                        </td>
                                        <td className="px-3 py-2.5 pr-2 text-slate-600 text-right tabular-nums">{formatInt(parseNumber(row.seats_filled))}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Quickest Filled Sections</h2>
                    <div className="overflow-auto rounded-lg border border-slate-100">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
                                <th className="px-3 py-2 pr-2">Section</th>
                                <th className="px-3 py-2 pr-2 text-right">Time to 0 Seats</th>
                            </tr>
                            </thead>
                            <tbody>
                            {quickestFilledSectionsAll.map((row) => (
                                <tr key={`quicksec-${row.semester}-${row.department}-${row.course}-${row.section}`} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors">
                                    <td className="px-3 py-2.5 pr-2 text-slate-700">
                                        <NavLink className="text-slate-800 hover:text-blue-700 no-underline hover:underline decoration-slate-300" to={`/history/${encodeURIComponent(sectionCode(row.department, row.course, row.section))}`}>
                                            {sectionCode(row.department, row.course, row.section)}
                                        </NavLink>
                                    </td>
                                    <td className="px-3 py-2.5 pr-2 text-slate-600 text-right tabular-nums">{formatMinutesHuman(parseNumber(row.quickest_minutes))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            </section>
        </div>
    );
}

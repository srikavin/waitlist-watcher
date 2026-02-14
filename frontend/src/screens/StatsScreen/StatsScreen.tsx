import {Alert, Spinner} from "evergreen-ui";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";
import {TimePeriod, useBucketStats} from "@/frontend/src/util/useBucketStats";
import {useTitle} from "@/frontend/src/util/useTitle";
import {NavLink} from "react-router-dom";
import {useMemo, useState} from "react";
import {ResponsiveContainer, Tooltip, Treemap} from "recharts";

function formatInt(value: number): string {
    return new Intl.NumberFormat().format(value);
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
    const low = [226, 232, 240];  // slate-200
    const high = [127, 29, 29];   // red-900
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

    return (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-md text-xs text-slate-700">
            <div className="font-semibold text-slate-900">{label}</div>
            <div>{`Waitlist: ${formatInt(waitlist)}`}</div>
            <div>{`Holdfile: ${formatInt(holdfile)}`}</div>
            <div>{`Pressure: ${(pressure * 100).toFixed(1)}%`}</div>
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
    const label = String(name ?? payload?.name ?? "");
    const textColor = fill === "#b91c1c" ? "#ffffff" : "#0f172a";

    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#ffffff" strokeWidth={1}/>
            {width > 70 && height > 18 ? (
                <text x={x + 5} y={y + 13} fill={textColor} fontSize={11}>
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

export function StatsScreen() {
    const {semester} = useSemesterContext();
    const {loading, error, overview, topCourses, mostWaitlistedCourses, mostWaitlistedSections, fastestFillingSections, quickestFilledSections} = useBucketStats(semester.id);
    const [period, setPeriod] = useState<TimePeriod>("24h");

    useTitle("Stats");

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
                    name: sectionCode(department, course, sectionRow.section),
                    size: Math.max(1, sectionRow.total_seats),
                    pressure: sectionRow.pressure,
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
                const coursePressure = courseSeats > 0 ? courseEffectiveWaitlist / courseSeats : 0;
                const courseSize = sectionNodes.reduce((sum, node) => sum + Number(node.size ?? 0), 0);
                const courseSectionCount = sectionNodes.reduce((sum, node) => sum + Number(node.section_count ?? 0), 0);
                return {
                    name: courseCode(department, course),
                    size: Math.max(1, courseSize),
                    pressure: coursePressure,
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
            const departmentPressure = departmentSeats > 0 ? departmentEffectiveWaitlist / departmentSeats : 0;
            const departmentSize = coursesRaw.reduce((sum, node) => sum + Number(node.size ?? 0), 0);
            const departmentSectionCount = coursesRaw.reduce((sum, node) => sum + Number(node.section_count ?? 0), 0);
            return {
                name: department,
                size: Math.max(1, departmentSize),
                pressure: departmentPressure,
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

        const allPressures = [
            ...departmentsRaw.map((department) => Number(department.pressure ?? 0)),
            ...departmentsRaw.flatMap((department) => department.children.map((course) => Number(course.pressure ?? 0))),
            ...departmentsRaw.flatMap((department) =>
                department.children.flatMap((course) => course.children.map((section) => Number(section.pressure ?? 0))),
            ),
        ].filter((value) => Number.isFinite(value) && value >= 0);
        const p95Pressure = percentile(allPressures, 0.95);
        const cappedMaxPressure = Math.max(Number.EPSILON, p95Pressure);
        const colorScore = (pressure: number) => {
            const normalized = Math.min(1, Math.max(0, pressure / cappedMaxPressure));
            const logBase = 24;
            return Math.log1p(logBase * normalized) / Math.log1p(logBase);
        };

        return departmentsRaw.map((department) => ({
            ...department,
            fill: heatColor(colorScore(Number(department.pressure ?? 0))),
            children: department.children.map((course) => ({
                ...course,
                fill: heatColor(colorScore(Number(course.pressure ?? 0))),
                children: course.children.map((section) => ({
                    ...section,
                    fill: heatColor(colorScore(Number(section.pressure ?? 0))),
                })),
            })),
        }));
    }, [mostWaitlistedSections]);

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

    const inSelectedPeriod = (rowPeriod: TimePeriod | undefined) => rowPeriod === period;
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

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="h2 text-slate-900">Live Stats</h1>
                    <p className="text-slate-600">Semester {semester.name} · refreshed every 10 minutes</p>
                </div>
                {overview?.generatedAt ? (
                    <p className="text-sm text-slate-500">Generated {formatGeneratedAt(overview.generatedAt)}</p>
                ) : null}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Events 24h</p>
                    <p className="text-2xl font-semibold text-slate-900">{formatInt(overview?.events24h ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Events 7d</p>
                    <p className="text-2xl font-semibold text-slate-900">{formatInt(overview?.events7d ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Open Seat Alerts 24h</p>
                    <p className="text-2xl font-semibold text-slate-900">{formatInt(overview?.openSeatAlerts24h ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Active Sections 24h</p>
                    <p className="text-2xl font-semibold text-slate-900">{formatInt(overview?.activeSections24h ?? 0)}</p>
                </div>
            </div>

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
                    <h2 className="text-lg font-semibold text-slate-900 mb-2">Waitlist Pressure Treemap</h2>
                    <p className="text-sm text-slate-500 mb-3">Darker red means higher waitlist pressure.</p>
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
                        <span>Pressure:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700">Low</span>
                        <span className="px-2 py-0.5 rounded bg-orange-400 text-white">Medium</span>
                        <span className="px-2 py-0.5 rounded bg-red-800 text-white">High</span>
                    </div>
                </div>
                <div className="lg:col-span-3 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-slate-600">Time range:</span>
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
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Most Active Courses ({period})</h2>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-2">Course</th>
                                <th className="pb-2 pr-2">Events</th>
                                <th className="pb-2">Seat Churn</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topActiveCourses.map((row) => (
                                <tr key={`${row.semester}-${row.period}-${row.department}-${row.course}`} className="border-b border-slate-50">
                                    <td className="py-2 pr-2 text-slate-700">
                                        <NavLink to={`/history/${encodeURIComponent(courseCode(row.department, row.course))}`}>
                                            {courseCode(row.department, row.course)}
                                        </NavLink>
                                    </td>
                                    <td className="py-2 pr-2 text-slate-600">{formatInt(Number(row.events ?? 0))}</td>
                                    <td className="py-2 text-slate-600">{formatInt(Number(row.seat_churn ?? 0))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Fastest Filling Sections ({period})</h2>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-2">Section</th>
                                <th className="pb-2 pr-2">Seats Filled</th>
                                <th className="pb-2">Events</th>
                            </tr>
                            </thead>
                            <tbody>
                            {fastestFillingSectionsInPeriod.map((row) => (
                                <tr key={`fillsec-${row.semester}-${row.period}-${row.department}-${row.course}-${row.section}`} className="border-b border-slate-50">
                                    <td className="py-2 pr-2 text-slate-700">
                                        <NavLink to={`/history/${encodeURIComponent(sectionCode(row.department, row.course, row.section))}`}>
                                            {sectionCode(row.department, row.course, row.section)}
                                        </NavLink>
                                    </td>
                                    <td className="py-2 pr-2 text-slate-600">{formatInt(parseNumber(row.seats_filled))}</td>
                                    <td className="py-2 text-slate-600">{formatInt(parseNumber(row.events))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Most Waitlisted Sections</h2>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-2">Section</th>
                                <th className="pb-2 pr-2">Waitlist</th>
                                <th className="pb-2">Seats</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topWaitlistedSections.map((row) => (
                                <tr key={`${row.semester}-${row.department}-${row.course}-${row.section}`} className="border-b border-slate-50">
                                    <td className="py-2 pr-2 text-slate-700">
                                        <NavLink to={`/history/${encodeURIComponent(sectionCode(row.department, row.course, row.section))}`}>
                                            {sectionCode(row.department, row.course, row.section)}
                                        </NavLink>
                                    </td>
                                    <td className="py-2 pr-2 text-slate-600">{formatInt(Number(row.waitlist ?? 0))}</td>
                                    <td className="py-2 text-slate-600">{formatInt(Number(row.open_seats ?? 0))}/{formatInt(Number(row.total_seats ?? 0))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Most Waitlisted Courses</h2>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-2">Course</th>
                                <th className="pb-2 pr-2">Total Waitlist</th>
                                <th className="pb-2">Sections</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topWaitlisted.map((row) => (
                                <tr key={`${row.semester}-${row.department}-${row.course}`} className="border-b border-slate-50">
                                    <td className="py-2 pr-2 text-slate-700">
                                        <NavLink to={`/history/${encodeURIComponent(courseCode(row.department, row.course))}`}>
                                            {courseCode(row.department, row.course)}
                                        </NavLink>
                                    </td>
                                    <td className="py-2 pr-2 text-slate-600">{formatInt(Number(row.total_waitlist ?? 0))}</td>
                                    <td className="py-2 text-slate-600">{formatInt(Number(row.sections ?? 0))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-3">Quickest Filled Sections</h2>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                <th className="pb-2 pr-2">Section</th>
                                <th className="pb-2 pr-2">Minutes to 0 Seats</th>
                                <th className="pb-2">Events</th>
                            </tr>
                            </thead>
                            <tbody>
                            {quickestFilledSectionsAll.map((row) => (
                                <tr key={`quicksec-${row.semester}-${row.department}-${row.course}-${row.section}`} className="border-b border-slate-50">
                                    <td className="py-2 pr-2 text-slate-700">
                                        <NavLink to={`/history/${encodeURIComponent(sectionCode(row.department, row.course, row.section))}`}>
                                            {sectionCode(row.department, row.course, row.section)}
                                        </NavLink>
                                    </td>
                                    <td className="py-2 pr-2 text-slate-600">{formatInt(parseNumber(row.quickest_minutes))}</td>
                                    <td className="py-2 text-slate-600">{formatInt(parseNumber(row.events))}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

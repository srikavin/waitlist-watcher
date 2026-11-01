import {deriveRecordedState, LastRecordedState} from "./LastRecordedState";
import {useContext, useEffect, useId, useRef, useState} from "react";
import {Card, EmptyState, Heading, Pane, SearchTemplateIcon, Text} from "evergreen-ui";
import dayjs from "dayjs";
import styles from './HistoryScreen.module.css'
import {WatchButton, WatchCourseButton} from "../../components/CourseListing/CourseListing";
import {Area, ComposedChart, CartesianGrid, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {Link} from "react-router-dom";
import {useSemesterContext} from "../../context/SemesterContext";
import {useTitle} from "../../util/useTitle";
import {ViewOnTestudo} from "../../components/ViewOnTestudo/ViewOnTestudo";
import {AddToSchedule} from "../../components/AddToSchedule/AddToSchedule";
import {useCourseEvents} from "../../util/useCourseEvents";
import {countWatchersFunction} from "../../firebase";
import {UserSubscriptionsContext} from "../../context/UserSubscriptions";
import {CourseEvent} from "@/common/events";

interface FormattedCourseEventProps {
    event: CourseEvent
    activeTime?: number | null
}

function MeetingTimeChanged(props: { event_data: any }) {
    const {event_data} = props;

    return JSON.parse(event_data).map((e: any, idx: number) => (
        <div key={idx}>{e.days} {e.start} - {e.end} {e.location.buildingCode} {e.location.classRoom} </div>
    ));
}

const nameMapping: Record<CourseEvent['type'], string> = {
    'course_added': 'Course added',
    'section_added': 'Section added',
    'course_removed': 'Course removed',
    'course_name_changed': 'Course name changed',
    'section_removed': 'Section removed',
    'instructor_changed': 'Instructor changed',
    'total_seats_changed': 'Total seats changed',
    'open_seat_available': 'Open seat became available',
    'open_seats_changed': 'Open seats changed',
    'waitlist_changed': 'Waitlist changed',
    'holdfile_changed': 'Holdfile changed',
    'course_description_changed': 'Course description changed',
    'meeting_times_changed': 'Meeting times changed',
}

export function FormattedCourseEvent(props: FormattedCourseEventProps) {
    const {event, activeTime} = props;
    const isActive = activeTime === new Date(event.timestamp).getTime();

    if (!(event.type in nameMapping)) {
        return (
            <>
                <b>Unknown Event</b>
                <pre className={styles.nowrap}>{JSON.stringify(event)}</pre>
            </>
        )
    }

    return (
        <div data-chart-active={isActive} className={`flex flex-col sm:flex-row gap-1 sm:gap-3 rounded px-2 py-1 -mx-2 ${isActive ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}>
            <small className="flex-shrink-0">{dayjs(event.timestamp).format("MM-DD-YYYY HH:mm")}</small>
            <span className="min-w-0">
            <span>{nameMapping[event.type]}
                {event.type === 'section_added' || event.type === 'section_removed' ? <> ({event.section})</> : ''}
                {event.type === 'course_added' && event.title ? <> ({event.course})</> : ''}
            </span>
                {event.type !== 'open_seat_available' && (
                    <>
                        {/* @ts-ignore */}
                        {event.old !== undefined && (
                            <> from <s>
                        <pre className={styles.old + " inline"}>
                        {event.type === 'meeting_times_changed' ? (
                            <MeetingTimeChanged event_data={event.old}/>
                        ) : (
                            /* @ts-ignore */
                            <>'{event.old}'</>
                        )}
                    </pre>
                            </s>
                            </>
                        )}
                        {/* @ts-ignore */}
                        {event.new !== undefined && (
                            <> to <pre className={styles.new + " inline"}>
                    {event.type === 'meeting_times_changed' ? (
                        <MeetingTimeChanged event_data={event.new}/>
                    ) : (
                        /* @ts-ignore */
                        <>'{event.new}'</>
                    )}
                    </pre>
                            </>
                        )}
                    </>
                )}
            </span>
        </div>
    );
}


function FormattedCourseEvents(props: { events: Array<CourseEvent>, activeTime?: number | null }) {
    const {events, activeTime} = props;

    const grouped = [];
    let lastType = undefined;
    for (let event of events) {
        if (event.type !== lastType) {
            grouped.push([event]);
            lastType = event.type;
        } else {
            grouped[grouped.length - 1].push(event);
        }
    }

    return (
        <>
            {grouped.flatMap(x => {
                const firstEvent = x[0]
                if (x.length == 1) {
                    return [
                        <FormattedCourseEvent event={firstEvent} activeTime={activeTime} key={firstEvent.id}/>
                    ]
                }
                if (firstEvent.type === 'total_seats_changed' || firstEvent.type === 'waitlist_changed' || firstEvent.type === 'holdfile_changed' || firstEvent.type === 'open_seats_changed') {
                    return [
                        <details key={firstEvent.id}>
                            <summary data-chart-active={x.some(event => new Date(event.timestamp).getTime() === activeTime)}
                                     className={`list-outside rounded px-2 py-1 -mx-2 ${x.some(event => new Date(event.timestamp).getTime() === activeTime) ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}>
                                <div className="flex flex-col sm:flex-row gap-1 sm:gap-3">
                                    <div className="leading-tight flex-shrink-0">
                                        <small
                                            className="block">{dayjs(x[0].timestamp).format("MM-DD-YYYY HH:mm")}</small>
                                        <small
                                            className="block">{dayjs(x[x.length - 1].timestamp).format("MM-DD-YYYY HH:mm")}</small>
                                    </div>
                                    {/* @ts-ignore */}
                                    <p className="place-self-center">{nameMapping[firstEvent.type]} from {x[x.length - 1].old} to {firstEvent.new}</p>
                                </div>
                            </summary>
                            <Pane display="flex" flexDirection="column" gap={0} paddingLeft={12} marginLeft={4}
                                  marginTop={4} borderLeft={'1px solid black'}>
                                {x.map(k => <FormattedCourseEvent key={k.id} event={k} activeTime={activeTime}/>)}
                            </Pane>
                        </details>
                    ]
                }
            })}
        </>
    )
}

interface HistoryScreenProps {
    name: string
    minimal?: boolean
    landing?: boolean
}

const numericalChangeEventTypes = [
    'total_seats_changed',
    'open_seats_changed',
    'waitlist_changed',
    'holdfile_changed'
]

function transformEventsToChart(events: Array<any>) {
    const changes = events
        .filter(event => numericalChangeEventTypes.includes(event.type))
        .filter(event => Number.isFinite(new Date(event.timestamp).getTime()))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const state: Record<string, number> = {};
    const points = new Map<number, Record<string, number>>();

    for (const type of numericalChangeEventTypes) {
        const first = changes.find(event => event.type === type);
        if (first?.old !== undefined && Number.isFinite(Number(first.old))) {
            state[type] = Math.max(0, Number(first.old));
        }
    }

    for (const event of changes) {
        if (event.new === undefined || !Number.isFinite(Number(event.new))) continue;
        state[event.type] = Math.max(0, Number(event.new));
        const open = state.open_seats_changed ?? 0;
        const total = state.total_seats_changed ?? 0;
        const time = new Date(event.timestamp).getTime();
        points.set(time, {
            time,
            total,
            filled: Math.max(0, total - open),
            open,
            waitlist: state.waitlist_changed ?? 0,
            holdfile: state.holdfile_changed ?? 0,
        });
    }

    return Array.from(points.values());
}

export function HistoryChart(props: { name: string, dockSummary?: boolean, onTimeHover?: (time: number | null) => void }) {
    const events = useCourseEvents(props.name);
    const syncId = useId();
    const [selectedTime, setSelectedTime] = useState<number | null>(null);
    const [isInspecting, setIsInspecting] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const [chartWidth, setChartWidth] = useState(600);
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const observer = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
        observer.observe(chart);
        return () => observer.disconnect();
    }, [events.length > 0]);
    const timeseriesData = transformEventsToChart([...events]);

    if (timeseriesData.length === 0) return null;

    const firstTime = timeseriesData[0].time;
    const lastTime = timeseriesData[timeseriesData.length - 1].time;
    const timePadding = firstTime === lastTime ? 60_000 : (lastTime - firstTime) * 0.025;
    const domain: [number, number] = [firstTime - timePadding, lastTime + timePadding];
    const shortRange = lastTime - firstTime < 48 * 60 * 60 * 1000;
    const instructorChanges = events
        .filter(event => event.type === 'instructor_changed')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .filter((event, index, changes) => index === 0 || event.new !== changes[index - 1].new);

    const plotWidth = Math.max(1, chartWidth - 64);
    const rowEnds: number[] = [];
    const instructorLabels = [...instructorChanges]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .filter(event => {
            const time = new Date(event.timestamp).getTime();
            return time >= domain[0] && time <= domain[1];
        })
        .map(event => {
            const x = 40 + (new Date(event.timestamp).getTime() - domain[0]) / (domain[1] - domain[0]) * plotWidth;
            const label = String(event.new);
            const width = Math.min(label.length * 7 + 16, plotWidth);
            const left = Math.max(8, Math.min(chartWidth - 8 - width, x - width / 2));
            let row = rowEnds.findIndex(end => end + 12 <= left);
            if (row < 0) row = rowEnds.length;
            rowEnds[row] = left + width;
            return {event, label, x, left, width, row};
        });
    const annotationHeight = rowEnds.length * 24;
    const selectedPoint = timeseriesData.find(point => point.time === selectedTime)
        ?? timeseriesData[timeseriesData.length - 1];
    const selectedInstructor = instructorChanges.find(event =>
        new Date(event.timestamp).getTime() === selectedPoint.time);
    const selectInstructor = (time: number) => {
        const point = timeseriesData.filter(point => point.time <= time).at(-1) ?? timeseriesData[0];
        setSelectedTime(point.time);
        setIsInspecting(true);
        props.onTimeHover?.(time);
    };

    const stopInspecting = () => {
        setIsInspecting(false);
        props.onTimeHover?.(null);
    };

    const renderChart = (queue: boolean) => (
        <div ref={queue ? undefined : chartRef} className="relative">
            {!queue && instructorLabels.map(({event, label, x, left, width, row}) => (
                <div key={event.id}>
                    <span className="absolute z-10 border-l border-dashed border-slate-400 pointer-events-none"
                          style={{left: x, top: 28 + row * 24, height: annotationHeight - row * 24 + 8}}/>
                    <button type="button" title={`${new Date(event.timestamp).toLocaleString()}: ${event.new}`}
                            className="absolute z-10 truncate text-xs text-slate-600 hover:text-blue-700 text-center px-1"
                            style={{left, width, top: 8 + row * 24}}
                            onMouseEnter={() => selectInstructor(new Date(event.timestamp).getTime())}
                            onMouseLeave={stopInspecting}
                            onFocus={() => selectInstructor(new Date(event.timestamp).getTime())}
                            onBlur={stopInspecting}>
                        {label}
                    </button>
                </div>
            ))}
            {!queue && <p className="absolute text-xs font-semibold text-slate-600"
                          style={{left: 8, top: annotationHeight + 8}}>Seats</p>}
        <ResponsiveContainer width="100%" height={queue ? 180 : 304 + annotationHeight}>
            <ComposedChart data={timeseriesData} syncId={syncId}
                           onMouseMove={(state: any) => {
                               const time = state?.activePayload?.[0]?.payload?.time;
                               if (typeof time === 'number') {
                                   setSelectedTime(time);
                                   setIsInspecting(true);
                                   props.onTimeHover?.(time);
                               }
                           }}
                           onMouseLeave={stopInspecting}
                           margin={{top: queue ? 12 : 36 + annotationHeight, right: 24, bottom: 8, left: 8}}>
                <CartesianGrid vertical={false} stroke="#e2e8f0"/>
                <XAxis dataKey="time" type="number" domain={domain} minTickGap={32}
                       tickFormatter={value => new Date(value).toLocaleString(undefined,
                           shortRange ? {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}
                               : {month: 'short', day: 'numeric'})}
                       fontSize={12}/>
                <YAxis name={queue ? "People waiting" : "Seats"} domain={[0, 'auto']}
                       width={32} allowDecimals={false} fontSize={12}/>
                <Tooltip content={() => null} cursor={{stroke: '#94a3b8', strokeDasharray: '3 3'}}/>
                <Legend wrapperStyle={{fontSize: 12}}/>
                {queue ? (
                    <>
                        <Area name="Waitlist" type="stepAfter" dataKey="waitlist"
                              dot={timeseriesData.length === 1} isAnimationActive={false}
                              stroke="#db2777" strokeDasharray="5 4" fill="#f9a8d4" fillOpacity={0.2}/>
                        <Area name="Holdfile" type="stepAfter" dataKey="holdfile"
                              dot={timeseriesData.length === 1} isAnimationActive={false}
                              stroke="#d97706" strokeDasharray="5 4" fill="#fcd34d" fillOpacity={0.2}/>
                    </>
                ) : (
                    <>
                        <Area name="Open Seats" type="stepAfter" dataKey="open"
                              dot={timeseriesData.length === 1} isAnimationActive={false}
                              stroke="#059669" strokeWidth={2} fill="#6ee7b7" fillOpacity={0.2}/>
                        <Line name="Total Seats" type="stepAfter" dataKey="total"
                              stroke="#0f172a" strokeWidth={3}
                              dot={timeseriesData.length === 1} isAnimationActive={false}/>
                        {instructorChanges.map(event => (
                            <ReferenceLine key={event.id} x={new Date(event.timestamp).getTime()}
                                           strokeDasharray="3 4" stroke="#64748b" strokeWidth={1.25} isFront/>
                        ))}
                    </>
                )}
            </ComposedChart>
        </ResponsiveContainer>
        </div>
    );

    return (
        <div className={`grid grid-cols-1 gap-4 items-start ${props.dockSummary ? "" : "lg:grid-cols-[minmax(0,1fr)_220px]"}`}>
            <aside aria-label="History summary" aria-hidden={!isInspecting}
                   className={`fixed bottom-4 left-4 right-4 z-30 pointer-events-none rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg ${props.dockSummary ? "sm:left-auto sm:w-[260px]" : "lg:pointer-events-auto lg:shadow-none lg:min-h-[160px] lg:order-2 lg:sticky lg:top-4 lg:bottom-auto lg:left-auto lg:right-auto"} ${isInspecting ? "visible" : "invisible"}`}>
                <p className="text-xs font-semibold text-slate-900 truncate">
                    {new Date(selectedPoint.time).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                    <span className="font-normal text-slate-500"> · {new Date(selectedPoint.time).toLocaleTimeString(undefined,
                        {hour: 'numeric', minute: '2-digit'})}</span>
                </p>
                <p className="mt-3 text-sm">
                    <strong className="text-emerald-700">{selectedPoint.open} open</strong>
                    <span className="text-slate-500"> / {selectedPoint.total} total seats</span>
                </p>
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-600 mr-1.5"/>
                        <strong className="text-slate-900">{selectedPoint.waitlist}</strong> waitlist</span>
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-600 mr-1.5"/>
                        <strong className="text-slate-900">{selectedPoint.holdfile}</strong> holdfile</span>
                </div>
                <p className="mt-3 h-4 truncate text-xs text-slate-500">
                    {selectedInstructor ? `Instructor: ${selectedInstructor.new}` : '\u00a0'}
                </p>
            </aside>
            <div className="min-w-0 lg:order-1">
                {renderChart(false)}
                <p className="ml-2 mt-4 mb-1 text-xs font-semibold text-slate-600">People waiting</p>
                {renderChart(true)}
            </div>
        </div>
    );
}

export function HistoryScreen(props: HistoryScreenProps) {
    const {name, minimal = false} = props;
    const {courseListing, semester} = useSemesterContext();
    const {subscriptionsBySemester} = useContext(UserSubscriptionsContext);

    const isSection = name.includes('-');
    const courseName = name.split('-')[0];
    const sectionName = isSection ? name.split('-')[1] : '';

    const [numberOfWatchers, setNumberOfWatchers] = useState(0);

    useEffect(() => {
        countWatchersFunction({course: courseName, section: sectionName, semester: semester.id}).then((r: any) => {
            if (r.data.success)
                setNumberOfWatchers(r.data.count);
        });
    }, [name, semester.id, subscriptionsBySemester])

    useTitle(`${name} Course History`);

    const events = useCourseEvents(name);
    const courseNameEvent = !isSection ? events.find(event => event.type === 'course_name_changed') : undefined;
    const recordedCourseName = typeof courseNameEvent?.new === 'string' ? courseNameEvent.new : undefined;
    const headingSubtitle = isSection ? deriveRecordedState(events).instructor : recordedCourseName;
    const [activeTime, setActiveTime] = useState<number | null>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const hoverGroupRef = useRef<HTMLDetailsElement | null>(null);

    useEffect(() => {
        const timeline = timelineRef.current;
        if (!timeline || !isSection) return;
        if (activeTime === null) {
            if (hoverGroupRef.current) hoverGroupRef.current.open = false;
            hoverGroupRef.current = null;
            return;
        }
        let target = timeline.querySelector<HTMLElement>('[data-chart-active="true"]');
        const activeGroup = target?.closest('details') ?? null;
        timeline.querySelectorAll('details').forEach(group => {
            group.open = group === activeGroup;
        });
        hoverGroupRef.current = activeGroup;
        if (!target) return;
        if (target.tagName === 'SUMMARY' && activeGroup) {
            target = activeGroup.querySelector<HTMLElement>('div[data-chart-active="true"]') ?? target;
        }
        const offset = target.getBoundingClientRect().top - timeline.getBoundingClientRect().top;
        timeline.scrollTo({top: timeline.scrollTop + offset - timeline.clientHeight / 2 + target.offsetHeight / 2});
    }, [activeTime, isSection]);

    const LinkToSection = minimal ? <Link to={`/history/${name}`}>{name}</Link> : (
        isSection ? <><Link
            to={`/history/${courseName}`}>{courseName}</Link> {sectionName}</> : name
    );

    const WatchingInfo = (
        <>
            {numberOfWatchers} {numberOfWatchers === 1 ? "person is" : "people are"} watching
            this {isSection ? "section" : "course"}.
        </>
    );

    return (
        <>
            {!props.landing && (
                <Pane display="flex" flexDirection="column" className="gap-1">
                    <Pane display="flex" alignItems="center" flexWrap="wrap" gap={12}>
                        <Heading size={900} className="text-slate-900">
                            {LinkToSection}
                        </Heading>
                        {isSection ?
                            <WatchButton courseName={courseName} sectionName={sectionName}/> :
                            <WatchCourseButton courseName={name}/>}
                    </Pane>

                    {headingSubtitle && (
                        <p className="mt-0 mb-1 max-w-3xl text-lg leading-6 text-slate-600">{headingSubtitle}</p>
                    )}
                    {isSection && <LastRecordedState events={events}/>}
                    <Pane marginTop={0}>
                        <Text className="text-slate-600">{WatchingInfo}</Text>
                    </Pane>

                    <Pane display={"flex"} gap={16}>
                        <Text size={500} className="text-slate-600">
                            <ViewOnTestudo course={courseName} section={sectionName}/>
                        </Text>
                        <Text size={500} className="text-slate-600">{isSection &&
                            <AddToSchedule course={courseName} section={sectionName}/>}</Text>
                    </Pane>
                </Pane>
            )}
            <Pane display="flex" gap={10} flexDirection="column" className="mt-4">
                <Card
                    border="1px solid #e2e8f0"
                    paddingY={16}
                    paddingX={20}
                    elevation={1}
                    className="rounded-2xl bg-white/90 shadow-sm">
                    {events.length === 0 ? (
                        <EmptyState title="No Events Found" icon={<SearchTemplateIcon/>}
                                    iconBgColor="#EDEFF5"
                                    description="Try looking at another course or coming back later."
                        >
                        </EmptyState>
                    ) : (
                        <>
                            {isSection && (
                                <Pane marginBottom={12}>
                                    {!props.landing &&
                                        <Heading size={800} marginBottom={8}>Registration Changes</Heading>}
                                    {props.landing && (
                                        <div className="mb-8">
                                            <Heading size={800}>{LinkToSection} Historical
                                                Data</Heading>
                                            <Text>{WatchingInfo}</Text>
                                        </div>
                                    )}
                                    <Pane marginTop={12}>
                                        <HistoryChart name={name} dockSummary={props.landing} onTimeHover={setActiveTime}/>
                                    </Pane>
                                </Pane>
                            )}
                            {!minimal && (
                                <>
                                    {/*<Heading size={800} marginBottom={8} className="text-slate-900">Historical Events</Heading>*/}
                                    <div ref={timelineRef} aria-label="Historical events"
                                         className={`flex flex-col gap-2 ml-2 text-sm text-slate-700 ${isSection ? "max-h-[420px] overflow-y-auto overscroll-contain px-2 py-2" : ""}`}>
                                        <FormattedCourseEvents events={events} activeTime={activeTime}/>
                                    </div>
                                </>
                            )}
                        </>)}
                </Card>
            </Pane>
            <Card>
            {!isSection && (
                <>
                    <div className="mt-8 space-y-8">
                        {(() => {
                            const filtered = courseListing.filter(e => e.startsWith(name + '-'));
                            if (filtered.length < 30) {
                                return filtered.map(e => <div key={e}><HistoryScreen name={e} minimal/>
                                </div>)
                            }
                            return null;
                        })()}
                    </div>
                </>
            )}
            </Card>
        </>
    );
}

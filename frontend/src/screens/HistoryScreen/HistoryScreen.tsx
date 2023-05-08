import {useContext, useEffect, useState} from "react";
import {Card, EmptyState, Heading, Pane, SearchTemplateIcon, Text} from "evergreen-ui";
import dayjs from "dayjs";
import styles from './HistoryScreen.module.css'
import {WatchButton, WatchCourseButton} from "../../components/CourseListing/CourseListing";
import {Label, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {Link} from "react-router-dom";
import {SemesterContext} from "../../context/SemesterContext";
import {useTitle} from "../../util/useTitle";
import {ViewOnTestudo} from "../../components/ViewOnTestudo/ViewOnTestudo";
import {AddToSchedule} from "../../components/AddToSchedule/AddToSchedule";
import {useCourseEvents} from "../../util/useCourseEvents";
import {countWatchersFunction} from "../../firebase";
import {UserSubscriptionsContext} from "../../context/UserSubscriptions";

interface FormattedCourseEventProps {
    event: object
}

function MeetingTimeChanged(props: { event_data: any }) {
    const {event_data} = props;

    return JSON.parse(event_data).map((e: any, idx: number) => (
        <div key={idx}>{e.days} {e.start} - {e.end} {e.location.buildingCode} {e.location.classRoom} </div>
    ));
}

const nameMapping: Record<string, string> = {
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
    'meeting_times_changed': 'Meeting times changed'
}

export function FormattedCourseEvent(props: FormattedCourseEventProps) {
    const {event} = props as any;

    // if () return null;

    if (!(event.type in nameMapping)) {
        return (
            <>
                <b>Unknown Event</b>
                <pre className={styles.nowrap}>{JSON.stringify(event)}</pre>
            </>
        )
    }

    return (
        <div className="flex gap-2">
            <small className="flex-shrink-0">{dayjs(event.timestamp).format("MM-DD-YYYY HH:mm")}</small>
            <span>
            <span>{nameMapping[event.type]}
                {event.type === 'section_added' || event.type === 'section_removed' ? <> ({event.section})</> : ''}
                {event.type === 'course_added' && event.title ? <> ({event.course})</> : ''}
            </span>
                {event.type !== 'open_seat_available' && (
                    <>
                        {event.old !== undefined && (
                            <> from <s>
                        <pre className={styles.old + " inline"}>
                        {event.type === 'meeting_times_changed' ? (
                            <MeetingTimeChanged event_data={event.old}/>
                        ) : (
                            <>'{event.old}'</>
                        )}
                    </pre>
                            </s>
                            </>
                        )}
                        {event.new !== undefined && (
                            <> to <pre className={styles.new + " inline"}>
                    {event.type === 'meeting_times_changed' ? (
                        <MeetingTimeChanged event_data={event.new}/>
                    ) : (
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


function FormattedCourseEvents(props: { events: Array<any> }) {
    const {events} = props;

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
                if (x.length == 1) {
                    return [
                        <FormattedCourseEvent event={x[0]} key={x[0].id}/>
                    ]
                }
                if (['total_seats_changed', 'waitlist_changed', 'holdfile_changed', 'open_seats_changed'].includes(x[0].type)) {
                    return [
                        <details>
                            <summary className="list-outside">
                                <div className="flex gap-2">
                                    <div className="leading-tight flex-shrink-0">
                                        <small
                                            className="block">{dayjs(x[0].timestamp).format("MM-DD-YYYY HH:mm")}</small>
                                        <small
                                            className="block">{dayjs(x[x.length - 1].timestamp).format("MM-DD-YYYY HH:mm")}</small>
                                    </div>
                                    <p className="place-self-center">{nameMapping[x[0].type]} from {x[x.length - 1].old} to {x[0].new}</p>
                                </div>
                            </summary>
                            <Pane display="flex" flexDirection="column" gap={0} paddingLeft={12} marginLeft={4}
                                  marginTop={4} borderLeft={'1px solid black'}>
                                {x.map(k => <FormattedCourseEvent event={k}/>)}
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
    const times: Record<string, { time: number, [key: string]: number }> = {};
    const vals: Record<string, Array<number>> = {};

    events.sort((a, b) => -new Date(b.timestamp) + +new Date(a.timestamp));

    events.forEach(e => {
        if (!numericalChangeEventTypes.includes(e.type)) {
            return;
        }

        if (!(e.timestamp in times)) {
            times[e.timestamp] = {time: new Date(e.timestamp).getTime()}
        }
        times[e.timestamp][e.type] = e.new;

        if (!(e.type in vals)) {
            vals[e.type] = [];
        }

        vals[e.type].push(e.new);
    });

    const ret = Object.values(times);
    if (ret.length === 0) return ret;

    ret.sort((a, b) => -new Date(b.time) + +new Date(a.time));

    // fill in gaps
    for (let type of numericalChangeEventTypes) {
        ret[0][type] = vals[type]?.[0] ?? undefined;
        ret[ret.length - 1][type] = vals[type]?.[vals[type].length - 1] ?? undefined;
    }

    return ret;
}

export function HistoryChart(props: { name: string }) {
    const events = useCourseEvents(props.name);
    const timeseriesData = transformEventsToChart([...events]);

    console.log(events, timeseriesData);

    if (timeseriesData.length === 0) return null;

    return (
        <ResponsiveContainer height={400}>
            <LineChart data={timeseriesData}>
                <XAxis dataKey="time" type="number"
                       domain={[timeseriesData[0].time, timeseriesData[timeseriesData.length - 1].time]}
                       tickFormatter={val => new Date(val).toLocaleDateString()}
                       fontSize={14}
                />
                <YAxis name="Count" fontSize={14}/>
                <Tooltip
                    labelFormatter={(label, payload) => new Date((payload?.[0]?.payload?.time ?? 0)).toLocaleString()}/>
                <Legend/>
                <Line connectNulls name="Total Seats"
                      dataKey="total_seats_changed"
                      stroke="#003f5c"/>
                <Line connectNulls name="Open Seats"
                      dataKey="open_seats_changed"
                      stroke="#7a5195"/>
                <Line connectNulls name="Waitlist Count"
                      dataKey="waitlist_changed"
                      stroke="#ef5675"/>
                <Line connectNulls name="Holdfile Count"
                      dataKey="holdfile_changed"
                      stroke="#ffa600"/>

                {events.map(e => {
                    if (e.type !== 'instructor_changed') return null;
                    return <ReferenceLine key={e.id} x={new Date(e.timestamp).getTime()}
                                          strokeDasharray="3 3"
                                          isFront={true}
                                          label={<Label fontSize={12} angle={300}
                                                        position={"middle"}
                                                        value={e.new}></Label>}
                                          stroke="green"/>
                })}
            </LineChart>
        </ResponsiveContainer>
    );
}

export function HistoryScreen(props: HistoryScreenProps) {
    const {name, minimal = false} = props;
    const {courseListing} = useContext(SemesterContext);
    const {userSubscriptions} = useContext(UserSubscriptionsContext);

    const isSection = name.includes('-');
    const courseName = name.split('-')[0];
    const sectionName = isSection ? name.split('-')[1] : '';

    const [numberOfWatchers, setNumberOfWatchers] = useState(0);

    useEffect(() => {
        countWatchersFunction({course: courseName, section: sectionName}).then((r: any) => {
            if (r.data.success)
                setNumberOfWatchers(r.data.count);
        });
    }, [name, userSubscriptions])

    useTitle(`${name} Course History`);

    const events = useCourseEvents(name);

    const LinkToSection = minimal ? <Link to={`/history/${name}`}>{name}</Link> : (
        isSection ? <><Link
            to={`/history/${courseName}`}>{courseName}</Link> {sectionName}</> : name
    );

    return (
        <>
            {!props.landing && (
                <Pane display="flex" flexDirection="column">
                    <Heading size={900}>
                        {LinkToSection}
                        <span className="mx-1">
                        {isSection ?
                            <WatchButton courseName={courseName} sectionName={sectionName}/> :
                            <WatchCourseButton courseName={name}/>}
                        </span>
                    </Heading>

                    <Pane marginTop={-8}>
                        <Text>{numberOfWatchers} {numberOfWatchers === 1 ? "person is" : "people are"} watching
                            this {isSection ? "section" : "course"}.</Text>
                    </Pane>

                    <Pane display={"flex"} gap={16}>
                        <Text size={500}><ViewOnTestudo course={courseName} section={sectionName}/></Text>
                        <Text size={500}>{isSection &&
                            <AddToSchedule course={courseName} section={sectionName}/>}</Text>
                    </Pane>
                </Pane>
            )}
            <Pane display="flex" gap={10} flexDirection="column">
                <Card border="1px solid #c1c4d6" paddingY={12} paddingX={16}>
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
                                    {props.landing &&
                                        <Heading size={800} marginBottom={8}>{LinkToSection} Historical Data</Heading>}
                                    <Pane marginLeft={-40} marginTop={32}>
                                        <HistoryChart name={name}/>
                                    </Pane>
                                </Pane>
                            )}
                            {!minimal && (
                                <>
                                    <Heading size={800} marginBottom={8}>Historical Events</Heading>
                                    <div className="flex flex-col gap-0.5 ml-6 text-sm">
                                        <FormattedCourseEvents events={events}/>
                                    </div>
                                </>
                            )}
                        </>)}
                </Card>
            </Pane>
            {!isSection && (
                <>
                    {(() => {
                        const filtered = courseListing.filter(e => e.startsWith(name + '-'));
                        if (filtered.length < 10) {
                            return filtered.map(e => <div className="mt-8"><HistoryScreen key={e} name={e} minimal/>
                            </div>)
                        }
                        return null;
                    })()}
                </>
            )}
        </>
    );
}

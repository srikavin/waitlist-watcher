import {doc, onSnapshot} from "firebase/firestore";
import {db} from "../../firebase";
import {useContext, useEffect, useState} from "react";
import {Card, EmptyState, Heading, Pane, SearchTemplateIcon} from "evergreen-ui";
import dayjs from "dayjs";
import styles from './HistoryScreen.module.css'
import {WatchButton, WatchCourseButton} from "../../components/CourseListing/CourseListing";
import {Label, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {remoteData} from "../../components/Search/Search";
import {Link} from "react-router-dom";
import {SemesterContext} from "../../context/SemesterContext";

interface FormattedCourseEventProps {
    event: object
}

export function FormattedCourseEvent(props: FormattedCourseEventProps) {
    const {event} = props as any;

    const nameMapping: Record<string, string> = {
        'course_added': 'Course Added',
        'section_added': 'Section Added',
        'course_removed': 'Course Removed',
        'course_name_changed': 'Course Name Changed',
        'section_removed': 'Section Removed',
        'instructor_changed': 'Instructor Changed',
        'total_seats_changed': 'Total Seats Changed',
        'open_seat_available': 'Open Seat Became Available',
        'open_seats_changed': 'Open Seats Changed',
        'waitlist_changed': 'Waitlist Changed',
        'holdfile_changed': 'Holdfile Changed'
    }

    if (event.type === 'open_seat_available') return null;

    if (!(event.type in nameMapping)) {
        return (
            <>
                <b>Unknown Event</b>
                <pre>{JSON.stringify(event)}</pre>
            </>
        )
    }

    return (
        <Pane display="inline-flex" gap={6} alignItems="baseline">
            <small>{dayjs(event.timestamp).format("MM-DD-YYYY HH:mm")}</small>
            <b>{nameMapping[event.type]}
                {event.type === 'section_added' || event.type === 'section_removed' ? <> ({event.section})</> : ''}
                {event.type === 'course_added' && event.title ? <> ({event.course})</> : ''}
            </b>
            {event.old !== undefined ? (
                <>from
                    <s>
                        <pre className={styles.old}>'{event.old}'</pre>
                    </s>
                </>
            ) : ''}
            {event.new !== undefined ? <>to <pre className={styles.new}>'{event.new}'</pre></> : ''}
        </Pane>
    );
}


interface HistoryScreenProps {
    name: string
    minimal?: boolean
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


export function HistoryScreen(props: HistoryScreenProps) {
    const {name, minimal = false} = props;
    const {semester, semesters} = useContext(SemesterContext);

    const isSection = name.includes('-');

    const [items, setItems] = useState<string[]>([]);
    const [events, setEvents] = useState<Array<any>>([])

    useEffect(() => {
        setItems(remoteData.courses);
    }, [remoteData.courses])

    useEffect(() => {
        const removeListener = onSnapshot(doc(db, "events" + semesters[semester].suffix, name), (doc) => {
            const eventMap: Record<string, any> = doc.get("events");
            setEvents(Object.values(eventMap)
                .sort((a, b) => {
                    if (a.timestamp === b.timestamp) return a.type.localeCompare(b.type);
                    return -new Date(a.timestamp) + +new Date(b.timestamp);
                }));
        });
        return () => {
            removeListener();
            setEvents([]);
        }
    }, [name, semesters, semester]);

    const timeseriesData = transformEventsToChart([...events]);

    return (
        <>
            <Heading size={900} marginBottom={8}>
                {minimal ? <Link to={`/history/${name}`}>{name}</Link> : name}{" "}
                {isSection ?
                    <WatchButton courseName={name.split('-')[0]} sectionName={name.split('-')[1]}/> :
                    <WatchCourseButton courseName={name}/>}
            </Heading>
            <Pane display="flex" gap={10} flexDirection="column" marginBottom={28}>
                <Card border="1px solid #c1c4d6" paddingY={12} paddingX={16}>
                    {events.length === 0 ? (
                        <EmptyState title="No Events Found" icon={<SearchTemplateIcon/>}
                                    iconBgColor="#EDEFF5"
                                    description="Try looking at another course or coming back later."
                        >
                        </EmptyState>
                    ) : (
                        <>
                            {isSection && timeseriesData.length > 0 && (
                                <Pane marginBottom={12}>
                                    <Heading size={800} marginBottom={8}>Registration Changes</Heading>
                                    <Pane marginLeft={-40} marginTop={32}>
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
                                    </Pane>
                                </Pane>
                            )}
                            {!minimal && (
                                <>
                                    <Heading size={800} marginBottom={8}>Historical Events</Heading>
                                    <Pane display="flex" flexDirection="column" gap={4}>
                                        {events.map((e) => (
                                            <FormattedCourseEvent key={e.id} event={e}/>
                                        ))}
                                    </Pane>
                                </>
                            )}
                        </>)}
                </Card>
            </Pane>
            {!isSection && (
                <>
                    {(() => {
                        const filtered = items.filter(e => e.startsWith(name + '-'));
                        if (filtered.length < 10) {
                            return filtered.map(e => <HistoryScreen name={e} minimal/>)
                        }
                        return null;
                    })()}
                </>
            )}
        </>
    );
}

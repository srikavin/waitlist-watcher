import {doc, onSnapshot} from "firebase/firestore";
import {db} from "../../firebase";
import {useEffect, useState} from "react";
import {CourseEvent} from "shared/types";
import {Card, Heading, Pane} from "evergreen-ui";
import dayjs from "dayjs";
import styles from './HistoryScreen.module.css'
import {WatchButton, WatchCourseButton} from "../../components/CourseListing/CourseListing";

interface FormattedCourseEventProps {
    event: CourseEvent
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
        <Pane display="flex" gap={10} alignItems="baseline">
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
}


export function HistoryScreen(props: HistoryScreenProps) {
    const {name} = props;

    const isSection = name.includes('-');

    const [events, setEvents] = useState<Array<CourseEvent>>([])

    useEffect(() => {
        return onSnapshot(doc(db, "events", name), (doc) => {
            const eventMap: Record<string, CourseEvent> = doc.get("events");
            setEvents(Object.values(eventMap)
                .sort((a, b) => {
                    if (a.timestamp === b.timestamp) return a.type.localeCompare(b.type);
                    return -new Date(a.timestamp) + +new Date(b.timestamp);
                }));
        });
    }, [name]);

    return (
        <>
            <Heading size={900} marginBottom={15}>
                {name}{" "}
                {isSection ?
                    <WatchButton courseName={name.split('-')[0]} sectionName={name.split('-')[1]}/> :
                    <WatchCourseButton courseName={name}/>}
            </Heading>
            <Pane display="flex" gap={10} flexDirection="column" marginBottom={80}>
                {/*<Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>*/}
                {/*    <Heading size={800}>Current Status</Heading>*/}
                {/**/}
                {/*</Card>*/}
                <Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>
                    <Heading size={800}>Historical Events</Heading>

                    <Pane marginY={20} display="flex" flexDirection="column" gap={5}>
                        {events.map((e: CourseEvent) => (
                            <FormattedCourseEvent event={e}/>
                        ))}
                    </Pane>
                </Card>
            </Pane>
        </>
    );
}

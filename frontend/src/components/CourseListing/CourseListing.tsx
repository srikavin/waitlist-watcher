import {db, realtime_db} from "../../firebase";
import {doc, onSnapshot} from "firebase/firestore";
import {useCallback, useContext, useEffect, useState} from "react";
import {AuthContext} from "../../context/AuthContext";
import {Alert, Button, Checkbox, EmptyState, Heading, Pane, Popover, Spinner, Table, Text, Tooltip} from "evergreen-ui";
import dayjs from 'dayjs'
import relativeTime from "dayjs/plugin/relativeTime";
import {get, ref, set, update} from "firebase/database";
import styles from "./CourseListing.module.css"

dayjs.extend(relativeTime);

interface CourseListingProps {
    prefix: string
}

interface CourseSection {
    holdfile: number,
    waitlist: number,
    instructor: string,
    section: string,
    openSeats: number,
    totalSeats: number
}

interface Course {
    course: string,
    sections: Record<string, CourseSection>
}

interface CourseData {
    lastRun: string,
    latest: Record<string, Course>
    timestamp: string,
    updateCount: number
}

interface WatchButtonBaseProps {
    subscriptionState: Record<string, boolean>;
    updateSubscriptionState: (newState: any) => any;
    subscriptionLabels: Record<string, string>;
    onOpen: () => void;
    onSave: (close: () => void) => void;
    isLoading: boolean,
    isErrored: boolean,
    title: string
    label: String
}


export function WatchButtonBase(props: WatchButtonBaseProps) {
    const {
        subscriptionState,
        updateSubscriptionState,
        subscriptionLabels,
        onOpen,
        isErrored,
        isLoading,
        title,
        label,
        onSave
    } = props;

    return (
        <Popover
            bringFocusInside
            onOpen={onOpen}
            content={({close}) => (
                <Pane
                    paddingX={20}
                    paddingY={20}
                    display="flex"
                    justifyContent="center"
                    flexDirection="column"
                >

                    <Heading>{title}</Heading>
                    <Pane marginBottom={10}>
                        <Text>Which events would you like to watch?</Text>

                        {isErrored ? (
                            <Alert intent="danger" title="Changes failed to save." marginY={12}>
                                Ensure that you are logged in.
                            </Alert>
                        ) : null}

                        {Object.keys(subscriptionLabels).map((k: keyof (typeof subscriptionLabels)) => (
                            <Checkbox key={k} checked={subscriptionState[k]}
                                      onChange={(v) => {
                                          let temp = {...subscriptionState};
                                          temp[k] = v.target.checked;
                                          updateSubscriptionState(temp);
                                      }}
                                      label={subscriptionLabels[k]}/>
                        ))}

                        <Pane display="flex">
                            <Button intent="danger" onClick={() => updateSubscriptionState({})}>Uncheck All</Button>
                        </Pane>
                    </Pane>
                    <Button isLoading={isLoading} onClick={() => onSave(close)}>Save</Button>
                </Pane>
            )}
        >
            <Button>{label}</Button>
        </Popover>
    );
}

interface WatchButtonProps {
    courseName: string;
    sectionName: string;
    label?: string;
}

interface WatchCourseButtonProps {
    courseName: string,
    label?: string;
}

export function WatchButton(props: WatchButtonProps) {
    const {courseName, sectionName} = props;

    const {isAuthed, getUser} = useContext(AuthContext);

    const [isSaving, setIsSaving] = useState(false);
    const [isErrored, setIsErrored] = useState(false);

    const subscriptionDefaults = {
        instructor_changed: true,
        open_seat_available: true,
        section_removed: true,
        waitlist_changed: true,
        holdfile_changed: false,
        open_seats_changed: false,
        total_seats_changed: false
    };

    const subscriptionLabels = {
        instructor_changed: "Instructor changed",
        open_seat_available: "Open seat available",
        section_removed: "Section removed",
        waitlist_changed: "Waitlist changed",
        holdfile_changed: "Holdfile changed",
        open_seats_changed: "Open seats changed",
        total_seats_changed: "Total seats changed"
    };

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!isAuthed) return;

        const subscriptionsRef = ref(realtime_db, `section_subscriptions/${courseName}/${sectionName}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [isAuthed, courseName, sectionName, getUser, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!isAuthed) return;

        const updates: any = {};

        const filteredEntries = Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val));

        updates[`section_subscriptions/${courseName}/${sectionName}/${getUser()!.uid}`] = filteredEntries;
        updates[`user_settings/${getUser()!.uid}/subscriptions/${courseName}-${sectionName}`] = filteredEntries;

        setIsSaving(true);
        setIsErrored(false);

        update(ref(realtime_db), updates)
            .then(() => {
                setIsSaving(false);
                closePopover();
            })
            .catch((e) => {
                setIsSaving(false);
                setIsErrored(true);
                console.error(e);
            })
    }, [courseName, sectionName, subscriptions])

    return (
        <WatchButtonBase subscriptionState={subscriptions} updateSubscriptionState={setSubscriptions}
                         subscriptionLabels={subscriptionLabels} onOpen={onPopoverOpen} isLoading={isSaving}
                         isErrored={isErrored} title={`Watch ${courseName}-${sectionName}`} onSave={onSave}
                         label={props.label || 'Watch'}/>
    )
}

export function WatchCourseButton(props: WatchCourseButtonProps) {
    const {courseName} = props;

    const {isAuthed, getUser} = useContext(AuthContext);

    const [isSaving, setIsSaving] = useState(false);
    const [isErrored, setIsErrored] = useState(false);

    const subscriptionDefaults = {
        course_removed: true,
        section_added: true,
        instructor_changed: true,
        open_seat_available: true,
        section_removed: true,
        waitlist_changed: true,
        holdfile_changed: false,
        open_seats_changed: false,
        total_seats_changed: false
    };

    const subscriptionLabels = {
        course_removed: "Course removed",
        section_added: "Section added",
        instructor_changed: "Section instructor changed",
        open_seat_available: "Open seat available",
        section_removed: "Section removed",
        waitlist_changed: "Section waitlist changed",
        holdfile_changed: "Section holdfile changed",
        open_seats_changed: "Section open seats changed",
        total_seats_changed: "Section total seats changed"
    };

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!isAuthed) return;

        const subscriptionsRef = ref(realtime_db, `course_subscriptions/${courseName}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [isAuthed, courseName, getUser, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!isAuthed) return;

        const updates: any = {};

        const filteredEntries = Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val));

        updates[`course_subscriptions/${courseName}/${getUser()!.uid}`] = filteredEntries;
        updates[`user_settings/${getUser()!.uid}/subscriptions/${courseName}`] = filteredEntries;

        setIsSaving(true);
        setIsErrored(false);

        update(ref(realtime_db), updates)
            .then(() => {
                setIsSaving(false);
                closePopover();
            })
            .catch((e) => {
                setIsSaving(false);
                setIsErrored(true);
                console.error(e);
            })
    }, [courseName, subscriptions])

    return (
        <WatchButtonBase subscriptionState={subscriptions} updateSubscriptionState={setSubscriptions}
                         subscriptionLabels={subscriptionLabels} onOpen={onPopoverOpen} isLoading={isSaving}
                         isErrored={isErrored} title={`Watch ${courseName}`} onSave={onSave}
                         label={props.label || 'Watch'}/>
    )
}


export function CourseListing(props: CourseListingProps) {
    const {prefix} = props;

    const [courses, setCourses] = useState<CourseData>();
    const [courseFilter, setCourseFilter] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');

    useEffect(() => {
        return onSnapshot(doc(db, "course_data", prefix), (doc) => {
            setCourses(doc.data() as CourseData);
        });
    }, [setCourses]);

    return (
        <>
            <Pane display="flex" paddingY={16} flexBasis="bottom" flexDirection="column" width="fit-content">
                <Heading size={900}>{prefix}</Heading>
                <Tooltip content={courses?.lastRun}><Text>Last
                    updated {dayjs().to(courses?.lastRun ?? -1)}</Text></Tooltip>
            </Pane>

            <Table minWidth="800px">
                <Table.Head>
                    <Table.SearchHeaderCell flexBasis={200} flexShrink={0} flexGrow={0} value={courseFilter}
                                            onChange={setCourseFilter}>Course</Table.SearchHeaderCell>
                    <Table.TextHeaderCell flexBasis={100} flexShrink={0} flexGrow={0}>Section</Table.TextHeaderCell>
                    <Table.TextHeaderCell flexBasis={150} flexShrink={0} flexGrow={0}>Instructor</Table.TextHeaderCell>
                    <Table.TextHeaderCell>Open Seats</Table.TextHeaderCell>
                    <Table.TextHeaderCell>Total Seats</Table.TextHeaderCell>
                    <Table.TextHeaderCell>Waitlist</Table.TextHeaderCell>
                    <Table.TextHeaderCell>Holdfile</Table.TextHeaderCell>
                    <Table.TextHeaderCell></Table.TextHeaderCell>
                </Table.Head>
                <Table.Body>
                    {courses ? (
                        Object.values(courses.latest).sort((a, b) => a.course.localeCompare(b.course))
                            .filter(e => e.course.includes(courseFilter))
                            .flatMap((e) => {
                                const course = [(
                                    <Table.Row key={e.course} isSelectable
                                               onSelect={() => setSelectedCourse(selectedCourse === e.course ? '' : e.course)}>
                                        <Table.TextCell flexBasis={200} flexShrink={0}
                                                        flexGrow={0}>{e.course}</Table.TextCell>
                                        <Table.TextCell flexBasis={100} flexShrink={0} flexGrow={0}></Table.TextCell>
                                        <Table.TextCell flexBasis={150} flexShrink={0} flexGrow={0}></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell><WatchCourseButton courseName={e.course}/></Table.TextCell>
                                    </Table.Row>
                                )]
                                if (e.course === selectedCourse) {
                                    return course.concat(Object.values(e.sections)
                                        .sort((a, b) => a.section.localeCompare(b.section))
                                        .map((s) => (
                                            <Table.Row key={e.course + s.section} className={styles.sectionRow}>
                                                <Table.TextCell flexBasis={200} flexShrink={0}
                                                                flexGrow={0}></Table.TextCell>
                                                <Table.TextCell flexBasis={100} flexShrink={0}
                                                                flexGrow={0}>{s.section}</Table.TextCell>
                                                <Table.TextCell flexBasis={150} flexShrink={0}
                                                                flexGrow={0}>{s.instructor}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.openSeats}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.totalSeats}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.waitlist}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.holdfile}</Table.TextCell>
                                                <Table.TextCell><WatchButton courseName={e.course}
                                                                             sectionName={s.section}/></Table.TextCell>
                                            </Table.Row>
                                        )))
                                }
                                return course;
                            })
                    ) : (
                        <EmptyState
                            title="Loading course and section waitlist data"
                            icon={<Spinner/>}
                            iconBgColor="#EDEFF5"
                            description="This might take a couple seconds for large departments."
                        />
                    )}
                </Table.Body>
            </Table>
        </>
    );
}
import {db, realtime_db} from "../../firebase";
import {doc, onSnapshot} from "firebase/firestore";
import {useCallback, useContext, useEffect, useState} from "react";
import {AuthContext} from "../../context/AuthContext";
import {Alert, Button, Checkbox, EmptyState, Heading, Pane, Popover, Spinner, Table, Text, Tooltip} from "evergreen-ui";
import dayjs from 'dayjs'
import relativeTime from "dayjs/plugin/relativeTime";
import {get, ref, set} from "firebase/database";
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

interface WatchButtonProps {
    prefix: string,
    course: Course,
    section: CourseSection
}

export function WatchButton(props: WatchButtonProps) {
    const {prefix, course, section} = props;

    const {auth, getUser} = useContext(AuthContext);

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

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!auth) return;

        const subscriptionsRef = ref(realtime_db, `section_subscriptions/${course.course}/${section.section}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [auth, course, section, getUser, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!auth) return;

        const subscriptionsRef = ref(realtime_db, `section_subscriptions/${course.course}/${section.section}/${getUser()?.uid}`);

        setIsSaving(true);

        set(subscriptionsRef, Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val)))
            .then(() => {
                setIsSaving(false);
                closePopover();
            })
            .catch((e) => {
                setIsSaving(false);
                setIsErrored(true);
                console.error(e);
            })
    }, [course, section, subscriptions])

    return (
        <Popover
            bringFocusInside
            onOpen={onPopoverOpen}
            content={({close}) => (
                <Pane
                    paddingX={20}
                    paddingY={20}
                    display="flex"
                    justifyContent="center"
                    flexDirection="column"
                >

                    <Heading>Watch {course.course}-{section.section}</Heading>
                    <Pane>
                        <Text>Which events would you like to watch?</Text>

                        {isErrored ? (
                            <Alert intent="danger"
                                   title="Changes failed to save." marginY={12}>
                                Ensure that you are logged in.
                            </Alert>
                        ) : null}

                        <Checkbox checked={subscriptions.instructor_changed}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      instructor_changed: v.target.checked
                                  })}
                                  label="Instructor changed"/>
                        <Checkbox checked={subscriptions.open_seat_available}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      open_seat_available: v.target.checked
                                  })}
                                  label="Open seat available"/>
                        <Checkbox checked={subscriptions.section_removed}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      section_removed: v.target.checked
                                  })}
                                  label="Section removed"/>
                        <Checkbox checked={subscriptions.waitlist_changed}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      waitlist_changed: v.target.checked
                                  })}
                                  label="Waitlist changed"/>
                        <Checkbox checked={subscriptions.holdfile_changed}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      holdfile_changed: v.target.checked
                                  })}
                                  label="Holdfile changed"/>
                        <Checkbox checked={subscriptions.open_seats_changed}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      open_seats_changed: v.target.checked
                                  })}
                                  label="Open seats changed"/>
                        <Checkbox checked={subscriptions.total_seats_changed}
                                  onChange={(v) => setSubscriptions({
                                      ...subscriptions,
                                      total_seats_changed: v.target.checked
                                  })}
                                  label="Total seats changed"/>
                    </Pane>
                    <Button isLoading={isSaving} onClick={() => onSave(close)}>Save</Button>
                </Pane>
            )}
        >
            <Button>Watch</Button>
        </Popover>
    );
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
                    <Table.SearchHeaderCell flexBasis={100} flexShrink={0} flexGrow={0} value={courseFilter}
                                            onChange={setCourseFilter}>Course</Table.SearchHeaderCell>
                    <Table.TextHeaderCell flexBasis={100} flexShrink={0} flexGrow={0}>Section</Table.TextHeaderCell>
                    <Table.TextHeaderCell flexBasis={200} flexShrink={0} flexGrow={0}>Instructor</Table.TextHeaderCell>
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
                                        <Table.TextCell flexBasis={100} flexShrink={0}
                                                        flexGrow={0}>{e.course}</Table.TextCell>
                                        <Table.TextCell flexBasis={100} flexShrink={0}
                                                        flexGrow={0}></Table.TextCell>
                                        <Table.TextCell flexBasis={200} flexShrink={0}
                                                        flexGrow={0}></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber></Table.TextCell>
                                        <Table.TextCell isNumber><WatchButton prefix={prefix} course={e}
                                                                              section={e.sections["0101"]}/></Table.TextCell>
                                    </Table.Row>
                                )]
                                if (e.course === selectedCourse) {
                                    return course.concat(Object.values(e.sections)
                                        .sort((a, b) => a.section.localeCompare(b.section))
                                        .map((s) => (
                                            <Table.Row key={e.course + s.section} className={styles.sectionRow}>
                                                <Table.TextCell flexBasis={100} flexShrink={0}
                                                                flexGrow={0}></Table.TextCell>
                                                <Table.TextCell flexBasis={100} flexShrink={0}
                                                                flexGrow={0}>{s.section}</Table.TextCell>
                                                <Table.TextCell flexBasis={200} flexShrink={0}
                                                                flexGrow={0}>{s.instructor}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.openSeats}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.totalSeats}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.waitlist}</Table.TextCell>
                                                <Table.TextCell isNumber>{s.holdfile}</Table.TextCell>
                                                <Table.TextCell isNumber><WatchButton prefix={prefix} course={e}
                                                                                      section={s}/></Table.TextCell>
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
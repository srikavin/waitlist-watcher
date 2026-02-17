import {realtime_db} from "../../firebase";
import {doc, onSnapshot} from "firebase/firestore";
import {useCallback, useContext, useEffect, useState} from "react";
import {AuthContext} from "../../context/AuthContext";
import {Alert, Button, Checkbox, EmptyState, Heading, Pane, Popover, Spinner, Table, Text, Tooltip} from "evergreen-ui";
import dayjs from 'dayjs'
import relativeTime from "dayjs/plugin/relativeTime";
import {get, ref, update} from "firebase/database";
import ProfessorNames from "../ProfessorName/ProfessorNames";
import {Link, NavLink} from "react-router-dom";
import {useSemesterContext} from "../../context/SemesterContext";
import {UserSubscriptionsContext} from "../../context/UserSubscriptions";
import {FSCourseDataConverter, FSCourseDataDocument} from "@/common/firestore";

dayjs.extend(relativeTime);

interface CourseListingProps {
    prefix: string
}
interface WatchButtonBaseProps {
    id: string,
    semesterId?: string,
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
        id,
        semesterId,
        subscriptionState,
        updateSubscriptionState,
        subscriptionLabels,
        onOpen,
        isErrored,
        isLoading,
        title,
        label,
        onSave,
    } = props;

    const {isAuthed} = useContext(AuthContext);
    const {subscriptionsBySemester, subscriptionMethods} = useContext(UserSubscriptionsContext);
    const {semester, semesters} = useSemesterContext();
    const effectiveSemesterId = semesterId ?? semester.id;
    const effectiveSemesterName = semesters[effectiveSemesterId]?.name ?? effectiveSemesterId;
    const latestSemesterId = Object.keys(semesters).sort((a, b) => Number(a) - Number(b)).at(-1) ?? effectiveSemesterId;
    const isPastSemester = Number(effectiveSemesterId) < Number(latestSemesterId);
    const isSubscribed = Boolean(subscriptionsBySemester[effectiveSemesterId]?.[id]);

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

                        {isErrored ? (
                            <Alert intent="danger" title="Changes failed to save." marginY={12}>
                                Ensure that you are logged in.
                            </Alert>
                        ) : null}

                        {!isAuthed && (
                            <Alert intent="danger" title="You aren't logged in." marginY={12}>
                                An account is required to watch courses.
                            </Alert>
                        )}

                        {isPastSemester && (
                            <Alert intent="warning" title="Past semester subscription" marginY={8}>
                                <Text size={300}>Applies to {effectiveSemesterName}, not the latest semester.</Text>
                            </Alert>
                        )}

                        {subscriptionMethods.length === 0 && (
                            <div className="my-4">
                                <Alert intent="danger" title={"No notification methods set!"}>
                                    <Text>
                                        Setup notification methods in <NavLink to={"/profile"}>your
                                        profile</NavLink> before watching courses.
                                    </Text>
                                </Alert>
                            </div>
                        )}

                        <Text>Which events would you like to watch?</Text>

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
                            <Button intent="danger" onClick={() => updateSubscriptionState({})}>Uncheck
                                All</Button>
                        </Pane>
                    </Pane>
                    <Button isLoading={isLoading}
                            disabled={!isAuthed || (Object.values(subscriptionState).filter(x => x).length !== 0 && subscriptionMethods.length === 0)}
                            onClick={() => onSave(close)}>Save</Button>
                </Pane>
            )}
        >
            <Button appearance={isSubscribed ? "primary" : "default"}>{label}</Button>
        </Popover>
    );
}

interface WatchButtonProps {
    courseName: string;
    sectionName: string;
    label?: string;
    semesterId?: string;
}

interface WatchCourseButtonProps {
    courseName: string,
    label?: string;
    semesterId?: string;
}

interface WatchDepartmentButtonProps {
    departmentName: string,
    label?: string;
    semesterId?: string;
}

interface WatchEverythingButtonProps {
    label?: string;
    semesterId?: string;
}

export function WatchButton(props: WatchButtonProps) {
    const {courseName, sectionName, semesterId} = props;

    const {isAuthed, getUser} = useContext(AuthContext);
    const {semester} = useSemesterContext();
    const effectiveSemesterId = semesterId ?? semester.id;

    const [isSaving, setIsSaving] = useState(false);
    const [isErrored, setIsErrored] = useState(false);

    const subscriptionDefaults = {
        section_added: true,
        section_removed: true,
        instructor_changed: true,
        total_seats_changed: true,
        open_seat_available: true,
        open_seats_changed: true,
        waitlist_changed: true,
        holdfile_changed: true,
        meeting_times_changed: true
    };

    const subscriptionLabels = {
        section_added: "Section added",
        section_removed: "Section removed",
        instructor_changed: "Section instructor changed",
        total_seats_changed: "Section total seats changed",
        open_seat_available: "Open seat available",
        open_seats_changed: "Section open seats changed",
        waitlist_changed: "Section waitlist changed",
        holdfile_changed: "Section holdfile changed",
        meeting_times_changed: "Section meeting times changed",
    };

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!isAuthed) return;

        const subscriptionsRef = ref(realtime_db, `section_subscriptions/${effectiveSemesterId}/${courseName}/${sectionName}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [isAuthed, courseName, sectionName, getUser, effectiveSemesterId, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!isAuthed) return;

        const updates: any = {};

        const filteredEntries = Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val));

        updates[`section_subscriptions/${effectiveSemesterId}/${courseName}/${sectionName}/${getUser()!.uid}`] = filteredEntries;
        updates[`user_settings/${getUser()!.uid}/subscriptions/${effectiveSemesterId}/${courseName}-${sectionName}`] = filteredEntries;

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
    }, [courseName, sectionName, effectiveSemesterId, subscriptions])

    return (
        <WatchButtonBase id={`${courseName}-${sectionName}`} semesterId={effectiveSemesterId} subscriptionState={subscriptions}
                         updateSubscriptionState={setSubscriptions} subscriptionLabels={subscriptionLabels}
                         onOpen={onPopoverOpen} isLoading={isSaving} isErrored={isErrored}
                         title={`Watch ${courseName}-${sectionName}`} onSave={onSave}
                         label={props.label || 'Watch'}/>
    )
}

export function WatchCourseButton(props: WatchCourseButtonProps) {
    const {courseName, semesterId} = props;

    const {isAuthed, getUser} = useContext(AuthContext);
    const {semester} = useSemesterContext();
    const effectiveSemesterId = semesterId ?? semester.id;

    const [isSaving, setIsSaving] = useState(false);
    const [isErrored, setIsErrored] = useState(false);

    const subscriptionDefaults = {
        course_added: true,
        section_added: true,
        course_removed: true,
        section_removed: true,
        course_name_changed: true,
        course_description_changed: true,
        instructor_changed: true,
        total_seats_changed: true,
        open_seat_available: true,
        open_seats_changed: false,
        waitlist_changed: true,
        holdfile_changed: false,
        meeting_times_changed: true
    };

    const subscriptionLabels = {
        course_added: "Course added",
        section_added: "Section added",
        course_removed: "Course removed",
        section_removed: "Section removed",
        course_name_changed: "Course name changed",
        course_description_changed: "Course description changed",
        instructor_changed: "Section instructor changed",
        total_seats_changed: "Section total seats changed",
        open_seat_available: "Open seat available",
        open_seats_changed: "Section open seats changed",
        waitlist_changed: "Section waitlist changed",
        holdfile_changed: "Section holdfile changed",
        meeting_times_changed: "Section meeting times changed",
    };

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!isAuthed) return;

        const subscriptionsRef = ref(realtime_db, `course_subscriptions/${effectiveSemesterId}/${courseName}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [isAuthed, courseName, getUser, effectiveSemesterId, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!isAuthed) return;

        const updates: any = {};

        const filteredEntries = Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val));

        updates[`course_subscriptions/${effectiveSemesterId}/${courseName}/${getUser()!.uid}`] = filteredEntries;
        updates[`user_settings/${getUser()!.uid}/subscriptions/${effectiveSemesterId}/${courseName}`] = filteredEntries;

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
    }, [courseName, effectiveSemesterId, subscriptions])

    return (
        <WatchButtonBase id={courseName} semesterId={effectiveSemesterId} subscriptionState={subscriptions} updateSubscriptionState={setSubscriptions}
                         subscriptionLabels={subscriptionLabels} onOpen={onPopoverOpen} isLoading={isSaving}
                         isErrored={isErrored} title={`Watch ${courseName}`} onSave={onSave}
                         label={props.label || 'Watch'}/>
    )
}

export function WatchDepartmentButton(props: WatchDepartmentButtonProps) {
    const {departmentName, semesterId} = props;

    const {isAuthed, getUser} = useContext(AuthContext);
    const {semester} = useSemesterContext();
    const effectiveSemesterId = semesterId ?? semester.id;

    const [isSaving, setIsSaving] = useState(false);
    const [isErrored, setIsErrored] = useState(false);

    const subscriptionDefaults = {
        course_added: true,
        section_added: true,
        course_removed: true,
        section_removed: true,
        course_name_changed: true,
        course_description_changed: true,
        instructor_changed: true,
        total_seats_changed: true,
        open_seat_available: true,
        open_seats_changed: false,
        waitlist_changed: false,
        holdfile_changed: false,
        meeting_times_changed: false
    };

    const subscriptionLabels = {
        course_added: "Course added",
        section_added: "Section added",
        course_removed: "Course removed",
        section_removed: "Section removed",
        course_name_changed: "Course name changed",
        course_description_changed: "Course description changed",
        instructor_changed: "Section instructor changed",
        total_seats_changed: "Section total seats changed",
        open_seat_available: "Open seat available",
        open_seats_changed: "Section open seats changed",
        waitlist_changed: "Section waitlist changed",
        holdfile_changed: "Section holdfile changed",
        meeting_times_changed: "Section meeting times changed",
    };

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!isAuthed) return;

        const subscriptionsRef = ref(realtime_db, `department_subscriptions/${effectiveSemesterId}/${departmentName}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [isAuthed, departmentName, getUser, effectiveSemesterId, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!isAuthed) return;

        const updates: any = {};

        const filteredEntries = Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val));

        updates[`department_subscriptions/${effectiveSemesterId}/${departmentName}/${getUser()!.uid}`] = filteredEntries;
        updates[`user_settings/${getUser()!.uid}/subscriptions/${effectiveSemesterId}/${departmentName}`] = filteredEntries;

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
    }, [departmentName, effectiveSemesterId, subscriptions])

    return (
        <WatchButtonBase id={departmentName} semesterId={effectiveSemesterId} subscriptionState={subscriptions}
                         updateSubscriptionState={setSubscriptions}
                         subscriptionLabels={subscriptionLabels} onOpen={onPopoverOpen} isLoading={isSaving}
                         isErrored={isErrored} title={`Watch ${departmentName}`} onSave={onSave}
                         label={props.label || 'Watch Department'}/>
    )
}

export function WatchEverythingButton(props: WatchEverythingButtonProps) {
    const {semesterId} = props;

    const {isAuthed, getUser} = useContext(AuthContext);
    const {semester} = useSemesterContext();
    const effectiveSemesterId = semesterId ?? semester.id;

    const [isSaving, setIsSaving] = useState(false);
    const [isErrored, setIsErrored] = useState(false);

    const subscriptionDefaults = {
        course_removed: true,
        section_added: true,
        instructor_changed: true,
        open_seat_available: true,
        open_seats_changed: true,
        section_removed: true,
        course_name_changed: true,
        total_seats_changed: true,
    };

    const subscriptionLabels = {
        course_removed: "Course removed",
        section_added: "Section added",
        instructor_changed: "Section instructor changed",
        open_seat_available: "Open seat available",
        open_seats_changed: "Section open seats changed",
        section_removed: "Section removed",
        course_name_changed: "Course name changed",
        total_seats_changed: "Section total seats changed",
    };

    const [subscriptions, setSubscriptions] = useState(subscriptionDefaults);

    const onPopoverOpen = useCallback(() => {
        if (!isAuthed) return;

        const subscriptionsRef = ref(realtime_db, `everything_subscriptions/${effectiveSemesterId}/${getUser()?.uid}`);

        get(subscriptionsRef).then((snapshot) => {
            if (!snapshot.exists()) {
                return;
            }

            setSubscriptions({...subscriptionDefaults, ...snapshot.val()});
        });
    }, [isAuthed, getUser, effectiveSemesterId, setSubscriptions]);

    const onSave = useCallback((closePopover: () => void) => {
        if (!isAuthed) return;

        const updates: any = {};
        const filteredEntries = Object.fromEntries(Object.entries(subscriptions).filter(([_, val]) => val));

        updates[`everything_subscriptions/${effectiveSemesterId}/${getUser()!.uid}`] = filteredEntries;
        updates[`user_settings/${getUser()!.uid}/subscriptions/${effectiveSemesterId}/everything`] = filteredEntries;

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
            });
    }, [effectiveSemesterId, isAuthed, subscriptions]);

    return (
        <WatchButtonBase id={"everything"} semesterId={effectiveSemesterId} subscriptionState={subscriptions}
                         updateSubscriptionState={setSubscriptions}
                         subscriptionLabels={subscriptionLabels} onOpen={onPopoverOpen} isLoading={isSaving}
                         isErrored={isErrored} title={`Watch everything`} onSave={onSave}
                         label={props.label || 'Edit'}/>
    )
}


export function CourseListing(props: CourseListingProps) {
    const {prefix} = props;

    const [courses, setCourses] = useState<FSCourseDataDocument>();
    const {semester, semesters} = useSemesterContext();

    useEffect(() => {
        const removeListener = onSnapshot(doc(semester.courseDataCollection, prefix).withConverter(FSCourseDataConverter), (doc) => {
            setCourses(doc.data());
        });

        return () => {
            removeListener();
            setCourses(undefined);
        }
    }, [setCourses, semester, semesters]);

    const headingPane = (
        <Pane display="flex" paddingY={16} flexBasis="bottom" flexDirection="column" width="fit-content">
            <Pane display="flex" flexDirection="row" gap={8}>
                <Heading size={900}>{prefix}</Heading>
                <WatchDepartmentButton departmentName={prefix}/>
            </Pane>
            <Tooltip content={`${courses?.lastRun}\nUpdated a total of ${courses?.updateCount} times`}>
                <Text>Last updated {dayjs().to(courses?.lastRun ?? -1)}</Text>
            </Tooltip>
        </Pane>
    );

    if (!courses) {
        return (
            <>
                {headingPane}
                <EmptyState
                    title="Loading course and section waitlist data"
                    icon={<Spinner/>}
                    iconBgColor="#EDEFF5"
                    description="This might take a couple seconds for large departments."
                />
            </>
        )
    }

    return (
        <>
            {headingPane}

            {Object.values(courses.latest)
                .sort((a, b) => a.course.localeCompare(b.course))
                .map((e) => (
                    <Pane key={e.course} display="flex" paddingY={16} flexBasis="bottom" flexDirection="column" gap={8}>
                        <Heading size={700}>
                            <WatchCourseButton courseName={e.course}/>&nbsp;
                            <Link to={`/history/${e.course}`}>{e.course} - {e.name}</Link>
                        </Heading>
                        <Table minWidth="800px">
                            <Table.Head>
                                <Table.TextHeaderCell flexBasis={100} flexShrink={0}
                                                      flexGrow={0}>Section</Table.TextHeaderCell>
                                <Table.TextHeaderCell flexBasis={150} flexShrink={0}
                                                      flexGrow={0}>Instructor</Table.TextHeaderCell>
                                <Table.TextHeaderCell>Open Seats</Table.TextHeaderCell>
                                <Table.TextHeaderCell>Total Seats</Table.TextHeaderCell>
                                <Table.TextHeaderCell>Waitlist</Table.TextHeaderCell>
                                <Table.TextHeaderCell>Holdfile</Table.TextHeaderCell>
                                <Table.TextHeaderCell></Table.TextHeaderCell>
                            </Table.Head>
                            <Table.Body>
                                {Object.values(e.sections).length === 0 ? (
                                    <EmptyState
                                        title="No sections."
                                        iconBgColor="#EDEFF5"
                                        description="This course has no sections."
                                        icon={<></>}/>
                                ) : (
                                    <>{Object.entries(e.sections)
                                        .sort((a, b) => a[0].localeCompare(b[0]))
                                        .map(([_, section]) => (
                                            <Table.Row key={section.section}>
                                                <Table.TextCell flexBasis={100} flexShrink={0}
                                                                flexGrow={0}>
                                                    <Link
                                                        to={`/history/${e.course}-${section.section}`}>{section.section}</Link>
                                                </Table.TextCell>
                                                <Table.TextCell flexBasis={150} flexShrink={0}
                                                                flexGrow={0}><ProfessorNames name={section.instructor}/></Table.TextCell>
                                                <Table.TextCell isNumber>{section.openSeats}</Table.TextCell>
                                                <Table.TextCell isNumber>{section.totalSeats}</Table.TextCell>
                                                <Table.TextCell isNumber>{section.waitlist}</Table.TextCell>
                                                <Table.TextCell isNumber>{section.holdfile}</Table.TextCell>
                                                <Table.TextCell><WatchButton courseName={e.course}
                                                                             sectionName={section.section}/></Table.TextCell>
                                            </Table.Row>
                                        ))}</>
                                )}
                            </Table.Body>
                        </Table>
                    </Pane>
                ))}
        </>
    );
}

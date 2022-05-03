import {db} from "../../firebase";
import {collection, getDoc, doc, getDocs, onSnapshot} from "firebase/firestore";
import {useContext, useEffect, useState} from "react";
import {AuthContext} from "../../context/AuthContext";
import {
    Button, Checkbox,
    EmptyState,
    Heading,
    Pane,
    Popover,
    SearchIcon,
    Spinner,
    Table,
    Text,
    TextInput,
    Tooltip
} from "evergreen-ui";
import * as dayjs from 'dayjs'
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface CourseListingProps {
    prefix: string
}

interface CourseSection {
    holdfile: number,
    waitlist: number,
    instructor: string,
    section: number,
    openSeats: number,
    totalSeats: number
}

interface Course {
    course: string,
    sections: CourseSection[]
}

interface CourseData {
    lastRun: string,
    latest: Course[],
    timestamp: string,
    updateCount: number
}

interface WatchButtonProps {
    course: Course,
    section: CourseSection
}

export function WatchButton(props: WatchButtonProps) {
    const {course, section} = props;
    return (
        <Popover
            bringFocusInside
            content={
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
                        <Checkbox checked label="Instructor changed"/>
                        <Checkbox checked label="Open seat available"/>
                        <Checkbox checked label="Section removed"/>
                        <Checkbox label="Waitlist changed"/>
                        <Checkbox label="Holdfile changed"/>
                        <Checkbox label="Open seats changed"/>
                        <Checkbox label="Total seats changed"/>
                    </Pane>
                    <Button>Save</Button>
                </Pane>
            }
        >
            <Button>Watch</Button>
        </Popover>
    );
}

export function CourseListing(props: CourseListingProps) {
    const {prefix} = props;

    const [courses, setCourses] = useState<CourseData>();

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
                    <Table.TextHeaderCell flexBasis={100} flexShrink={0} flexGrow={0}>Course</Table.TextHeaderCell>
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
                        courses.latest.flatMap((e) => (
                            e.sections.map((s) => (
                                <Table.Row key={e.course + s.section}>
                                    <Table.TextCell flexBasis={100} flexShrink={0}
                                                    flexGrow={0}>{e.course}</Table.TextCell>
                                    <Table.TextCell flexBasis={100} flexShrink={0}
                                                    flexGrow={0}>{s.section}</Table.TextCell>
                                    <Table.TextCell flexBasis={200} flexShrink={0}
                                                    flexGrow={0}>{s.instructor}</Table.TextCell>
                                    <Table.TextCell isNumber>{s.openSeats}</Table.TextCell>
                                    <Table.TextCell isNumber>{s.totalSeats}</Table.TextCell>
                                    <Table.TextCell isNumber>{s.waitlist}</Table.TextCell>
                                    <Table.TextCell isNumber>{s.holdfile}</Table.TextCell>
                                    <Table.TextCell isNumber><WatchButton course={e} section={s}/></Table.TextCell>
                                </Table.Row>
                            ))
                        ))
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
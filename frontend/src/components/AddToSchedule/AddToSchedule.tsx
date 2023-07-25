import {useSemesterContext} from "../../context/SemesterContext";

export function AddToSchedule(props: { course: string, section: string }) {
    const {semester} = useSemesterContext();
    const {course, section} = props;

    const url = `https://app.testudo.umd.edu/main/dropAdd?venusTermId=${semester}&crslist=${course}_/${section}`;

    return <a href={url} target="_blank">Add to Schedule</a>
}
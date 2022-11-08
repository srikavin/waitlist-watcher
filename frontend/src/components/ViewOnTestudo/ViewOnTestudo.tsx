import {useContext} from "react";
import {SemesterContext} from "../../context/SemesterContext";
import {Button} from "evergreen-ui";

export function ViewOnTestudo(props: { course: string, section?: string }) {
    const {semester} = useContext(SemesterContext);
    const {course, section} = props;

    const url = `https://app.testudo.umd.edu/soc/search?courseId=${course}&sectionId=${section ?? ''}&termId=${semester}&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`;

    return <Button onClick={() => open(url, "_blank")}>View on Testudo</Button>
}
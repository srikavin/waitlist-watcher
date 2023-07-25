import {createContext, useContext} from "react";
import {CollectionReference} from "firebase/firestore";
import {FSCourseDataDocument, FSEventsDocument} from "@/common/firestore";

type Semester = string;

export interface SemesterInfo {
    name: string,
    courseDataCollection: CollectionReference<FSCourseDataDocument>,
    eventsCollection: CollectionReference<FSEventsDocument>,
}

type SemesterContextValue = {
    semester: SemesterInfo,
    semesters: Record<Semester, SemesterInfo>
    setSemester: (semester: Semester) => void
    courseListing: string[]
};

const SemesterContext = createContext<SemesterContextValue | undefined>(undefined);

export const SemesterContextProvider = SemesterContext.Provider;

export const useSemesterContext = () => {
    const data = useContext(SemesterContext);
    if (!data) {
        throw new Error("SemesterContext used outside of provider!")
    }
    return data;
}
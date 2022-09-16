import {createContext} from "react";

type Semester = string;

type SemesterContextValue = {
    semester: Semester,
    semesters: Record<Semester, { name: string, suffix: string }>
    setSemester: (semester: Semester) => void
};

export const SemesterContext = createContext<SemesterContextValue>({
    semester: "",
    semesters: {},
    setSemester: () => null,
});
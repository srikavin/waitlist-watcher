import {CourseDataCourse, CourseEvent} from "./events";

export interface FSCourseDataDocument {
    lastRun: string,
    latest: Record<string, CourseDataCourse>
    timestamp: string,
    updateCount: number,
    version: 2
}

export interface FSCourseListingDocument {
    courses: string
}

export interface FSEventsDocument {
    events: Record<string, CourseEvent>
}

export const FSConverter = <T>() => ({
    toFirestore: (data: T) => data,
    fromFirestore: (snap: any) => snap.data() as T
})

export const FSCourseDataConverter = FSConverter<FSCourseDataDocument>();
export const FSEventsConverter = FSConverter<FSEventsDocument>();
export const FSCourseListingConverter = FSConverter<FSCourseListingDocument>();

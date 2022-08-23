export interface CourseDataSection {
    section: string,
    holdfile: number,
    instructor: string,
    openSeats: number,
    totalSeats: number,
    waitlist: number
}

export interface CourseDataCourse {
    course: string,
    name: string,
    sections: Record<string, CourseDataSection>,
}

export type CourseDataCourses = Record<string, CourseDataCourse>;

interface ICourseEvent<T> {
    id: T
    timestamp: string
    type: string
    course: string
    title: string
}

interface ICourseSectionEvent {
    section: string
}

interface ICourseChangeEvent<T> {
    old: T
    new: T
}

type CourseEventCourseAdded = ICourseEvent<'course_added'>;
type CourseEventSectionAdded = ICourseEvent<'section_added'> & ICourseSectionEvent;
type CourseEventCourseRemoved = ICourseEvent<'course_removed'>;
type CourseEventCourseNameChanged = ICourseEvent<'course_name_changed'> & ICourseChangeEvent<string>;
type CourseEventSectionRemoved = ICourseEvent<'section_removed'> & ICourseSectionEvent;
type CourseEventInstructorChanged = ICourseEvent<'instructor_changed'> & ICourseChangeEvent<string>;
type CourseEventTotalSeatsChanged = ICourseEvent<'total_seats_changed'> & ICourseChangeEvent<number>;
type CourseEventOpenSeatAvailable = ICourseEvent<'open_seat_available'> & ICourseChangeEvent<number>;
type CourseEventOpenSeatsChanged = ICourseEvent<'open_seats_changed'> & ICourseChangeEvent<number>;
type CourseEventWaitlistChanged = ICourseEvent<'waitlist_changed'> & ICourseChangeEvent<number>;
type CourseEventHoldfileChanged = ICourseEvent<'holdfile_changed'> & ICourseChangeEvent<number>;

export type CourseEvent = CourseEventCourseAdded |
    CourseEventSectionAdded |
    CourseEventCourseRemoved |
    CourseEventCourseNameChanged |
    CourseEventSectionRemoved |
    CourseEventInstructorChanged |
    CourseEventTotalSeatsChanged |
    CourseEventOpenSeatAvailable |
    CourseEventOpenSeatsChanged |
    CourseEventWaitlistChanged |
    CourseEventHoldfileChanged;

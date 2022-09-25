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

export type EventTypes = 'course_added' |
    'section_added' |
    'course_removed' |
    'section_removed' |
    'course_name_changed' |
    'instructor_changed' |
    'total_seats_changed' |
    'open_seat_available' |
    'open_seats_changed' |
    'waitlist_changed' |
    'holdfile_changed';

export interface BaseEvent<T extends EventTypes = EventTypes> {
    id: string
    timestamp: string
    type: T
    course: string
    title: string
    semester: string
}

export interface ICourseEvent<T extends EventTypes> extends BaseEvent<T> {
    section: never
}

export interface ICourseSectionEvent<T extends EventTypes> extends BaseEvent<T> {
    section: string
}

export interface ICourseChangeEvent<T extends EventTypes, R> extends ICourseEvent<T> {
    old: R
    new: R
}

export interface ICourseSectionChangeEvent<T extends EventTypes, R> extends ICourseSectionEvent<T> {
    old: R
    new: R
}

export type IChangeEvent<T extends EventTypes, R> = ICourseChangeEvent<T, R> | ICourseSectionChangeEvent<T, R>;

export type CourseEventCourseAdded = ICourseEvent<'course_added'>;
export type CourseEventSectionAdded = ICourseSectionEvent<'section_added'>;
export type CourseEventCourseRemoved = ICourseEvent<'course_removed'>;
export type CourseEventSectionRemoved = ICourseSectionEvent<'section_removed'>;
export type CourseEventCourseNameChanged = ICourseChangeEvent<'course_name_changed', string>;
export type CourseEventInstructorChanged = ICourseSectionChangeEvent<'instructor_changed', string>;
export type CourseEventTotalSeatsChanged = ICourseSectionChangeEvent<'total_seats_changed', number>;
export type CourseEventOpenSeatAvailable = ICourseSectionChangeEvent<'open_seat_available', number>;
export type CourseEventOpenSeatsChanged = ICourseSectionChangeEvent<'open_seats_changed', number>;
export type CourseEventWaitlistChanged = ICourseSectionChangeEvent<'waitlist_changed', number>;
export type CourseEventHoldfileChanged = ICourseSectionChangeEvent<'holdfile_changed', number>;

export type AddRemoveEvents = CourseEventCourseAdded |
    CourseEventSectionAdded |
    CourseEventCourseRemoved |
    CourseEventSectionRemoved;

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

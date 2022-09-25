import {
    AddRemoveEvents,
    CourseEvent,
    CourseEventOpenSeatAvailable,
    EventTypes,
    IChangeEvent,
    ICourseEvent,
    ICourseSectionEvent
} from "../types";

const generateFooter = (event: CourseEvent) => {
    return {
        "text": `Event ${event.id} with category ${event.type} (version ${process.env.K_REVISION}) at (${event.timestamp}).`
    };
}

const generateUrl = (event: ICourseEvent<any> | ICourseSectionEvent<any>) => {
    return `https://waitlist-watcher.web.app/history/${event.course}${event.section ? '-' + event.section : ''}`;
}

const mapSemester = (semester: string) => {
    if (semester === "202208") return "Fall 2022";
    if (semester === "202301") return "Spring 2023";
    return semester;
}

const seatAvailable = (event: CourseEventOpenSeatAvailable) => {
    return {
        "title": `Open Seat Available in ${event.course}-${event.section}`,
        "url": generateUrl(event),
        "color": 5832650,
        "fields": [
            {
                "name": "Course Title",
                "value": String(event.title),
                "inline": true
            },
            {
                "name": "Course Code",
                "value": event.course,
                "inline": true
            },
            {
                "name": "Section",
                "value": event.section,
                "inline": true
            },
            {
                "name": "Semester",
                "value": mapSemester(event.semester),
                "inline": true
            },
            {
                "name": "Seats Available",
                "value": String(event.new)
            }
        ],
        "footer": generateFooter(event)
    }
}

const addRemoveEvent = (title_fn: (event: AddRemoveEvents) => string) => {
    return (event: AddRemoveEvents) => (
        {
            "title": title_fn(event),
            "url": generateUrl(event),
            "color": 16734296,
            "fields": [
                {
                    "name": "Course Title",
                    "value": String(event.title),
                    "inline": true
                },
                {
                    "name": "Course Code",
                    "value": event.course,
                    "inline": true
                },
                ...(event.section ? [{
                    "name": "Section",
                    "value": event.section,
                    "inline": true
                }] : []),
                {
                    "name": "Semester",
                    "value": mapSemester(event.semester),
                    "inline": true
                },
            ],
            "footer": generateFooter(event)
        }
    );
}

const simpleChangeEvent = (title_fn: (event: IChangeEvent<any, any>) => string, old_title: string, new_title: string, color: number) => {
    return (event: IChangeEvent<any, any>) => (
        {
            "title": title_fn(event),
            "url": generateUrl(event),
            "color": color,
            "fields": [
                {
                    "name": "Course Title",
                    "value": String(event.title),
                    "inline": true
                },
                {
                    "name": "Course Code",
                    "value": String(event.course),
                    "inline": true
                },
                ...(event.section ? [{
                    "name": "Section",
                    "value": event.section,
                    "inline": true
                }] : []),
                {
                    "name": "Semester",
                    "value": mapSemester(event.semester),
                    "inline": true
                },
                {
                    "name": old_title,
                    "value": String(event.old)
                },
                {
                    "name": new_title,
                    "value": String(event.new)
                }
            ],
            "footer": generateFooter(event)
        }
    );
}

const totalSeatsChanged = simpleChangeEvent(
    (event) => `Total Seats changed for ${event.course}-${event.section}`,
    "Previous seats available",
    "Seats available",
    5814783
);

const openSeatsChanged = simpleChangeEvent(
    (event) => `Open Seats changed for ${event.course}-${event.section}`,
    "Previous open seats available",
    "Open seats available",
    5814783
);

const instructorChanged = simpleChangeEvent(
    (event) => `Instructor changed for ${event.course}-${event.section}`,
    "Previous Instructor",
    "New Instructor",
    16734296
);

const waitlistChanged = simpleChangeEvent(
    (event) => `Waitlist changed for ${event.course}-${event.section}`,
    "Previous Waitlist Count",
    "New Waitlist Count",
    5814783
);

const holdfileChanged = simpleChangeEvent(
    (event) => `Holdfile changed for ${event.course}-${event.section}`,
    "Previous Holdfile Count",
    "New Holdfile Count",
    5814783
);

const courseNameChanged = simpleChangeEvent(
    (event) => `Course Name changed for ${event.course}`,
    "Previous Course Name",
    "New Course Name",
    16734296
);


const sectionRemoved = addRemoveEvent((event) => `Section ${event.course}-${event.section} Removed`);
const sectionAdded = addRemoveEvent((event) => `Section ${event.course}-${event.section} Added`);
const courseRemoved = addRemoveEvent((event) => `Course ${event.course} Removed`);
const courseAdded = addRemoveEvent((event) => `Course ${event.course} Added`);

const unknownEvent = (event: any) => {
    return {
        "title": `Unknown event`,
        "url": generateUrl(event),
        "color": 16734296,
        "fields": Object.entries(event).map(([k, v]) => ({
            "name": JSON.stringify(k),
            "value": JSON.stringify(v)
        })),
        "footer": generateFooter(event)
    };
}

export const getDiscordContent = (events: Array<CourseEvent>) => {
    const mapping: Record<EventTypes, (event: any) => object> = {
        "open_seat_available": seatAvailable,
        "open_seats_changed": openSeatsChanged,
        "total_seats_changed": totalSeatsChanged,
        "instructor_changed": instructorChanged,
        "waitlist_changed": waitlistChanged,
        "holdfile_changed": holdfileChanged,
        "course_name_changed": courseNameChanged,
        "section_added": sectionAdded,
        "section_removed": sectionRemoved,
        "course_added": courseAdded,
        "course_removed": courseRemoved
    }

    return {
        "content": null,
        "embeds": events.map((event) => {
            if (event.type in mapping) {
                return mapping[event.type](event)
            }
            return unknownEvent(event);
        }),
        "username": "Waitlist Watcher",
        "attachments": []
    }
}

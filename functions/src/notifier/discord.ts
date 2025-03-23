import {
    AddRemoveEvents,
    CourseEvent,
    CourseEventOpenSeatAvailable,
    EventTypes,
    IChangeEvent,
    ICourseEvent,
    ICourseSectionEvent,
    TestNotificationEvent
} from "@/common/events";

const generateFooter = (event: CourseEvent) => {
    return {
        "text": `Event ${event.id} with category ${event.type} (version ${process.env.K_REVISION}) at (${event.timestamp}).`
    };
}

const generateUrl = (event: ICourseEvent<any> | ICourseSectionEvent<any>) => {
    return `https://waitlist-watcher.web.app/history/${event.course}${event.section ? '-' + event.section : ''}?semester=${event.semester}`;
}

const mapSemester = (semester: string) => {
    if (semester === "202208") return "Fall 2022";
    if (semester === "202301") return "Spring 2023";
    if (semester === "202308") return "Fall 2023";
    if (semester === "202401") return "Spring 2024";
    if (semester === "202408") return "Fall 2024";
    if (semester === "202501") return "Spring 2025";
    if (semester === "202508") return "Fall 2025";
    return semester;
}

const discordFieldValue = (x: string) => {
    if (x.trim().length == 0) {
        return "<empty>";
    }

    if (x.length > 1000) {
        return x.substring(0, 1000) + "..."
    }

    return x;
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
                "value": discordFieldValue(event.course),
                "inline": true
            },
            {
                "name": "Section",
                "value": discordFieldValue(event.section),
                "inline": true
            },
            {
                "name": "Semester",
                "value": discordFieldValue(mapSemester(event.semester)),
                "inline": true
            },
            {
                "name": "Seats Available",
                "value": discordFieldValue(String(event.new))
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
                    "value": discordFieldValue(String(event.title)),
                    "inline": true
                },
                {
                    "name": "Course Code",
                    "value": discordFieldValue(event.course),
                    "inline": true
                },
                ...(event.section ? [{
                    "name": "Section",
                    "value": discordFieldValue(event.section),
                    "inline": true
                }] : []),
                {
                    "name": "Semester",
                    "value": discordFieldValue(mapSemester(event.semester)),
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
                    "value": discordFieldValue(String(event.title)),
                    "inline": true
                },
                {
                    "name": "Course Code",
                    "value": discordFieldValue(String(event.course)),
                    "inline": true
                },
                ...(event.section ? [{
                    "name": "Section",
                    "value": discordFieldValue(event.section),
                    "inline": true
                }] : []),
                {
                    "name": "Semester",
                    "value": discordFieldValue(mapSemester(event.semester)),
                    "inline": true
                },
                {
                    "name": old_title,
                    "value": discordFieldValue(String(event.old))
                },
                {
                    "name": new_title,
                    "value": discordFieldValue(String(event.new))
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

const courseDescriptionChanged = simpleChangeEvent(
    (event) => `Course Description changed for ${event.course}`,
    "Previous Course Description",
    "New Course Description",
    5814783
);

const meetingTimesChanged = simpleChangeEvent(
    (event) => `Meeting Times changed for ${event.course}-${event.section}`,
    "Previous Meeting Times",
    "New Meeting Times",
    16734296
);

const testNotification = simpleChangeEvent(
    (event) => `This is an example notification for ${event.course}-${event.section}`,
    "Previous Value",
    "New Value",
    16734296
)

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
            "name": discordFieldValue(JSON.stringify(k)),
            "value": discordFieldValue(JSON.stringify(v))
        })),
        "footer": generateFooter(event)
    };
}

export const getDiscordContent = (events: Array<CourseEvent | TestNotificationEvent>) => {
    const mapping: Record<EventTypes, (event: any) => object> = {
        "open_seat_available": seatAvailable,
        "open_seats_changed": openSeatsChanged,
        "total_seats_changed": totalSeatsChanged,
        "instructor_changed": instructorChanged,
        "waitlist_changed": waitlistChanged,
        "holdfile_changed": holdfileChanged,
        "course_name_changed": courseNameChanged,
        "course_description_changed": courseDescriptionChanged,
        "meeting_times_changed": meetingTimesChanged,
        "section_added": sectionAdded,
        "section_removed": sectionRemoved,
        "course_added": courseAdded,
        "course_removed": courseRemoved,
        "test_notification": testNotification
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

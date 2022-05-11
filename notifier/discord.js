const generateFooter = (execution, event) => {
    return {
        "text": `Event ${execution} with category ${event.type} (version ${process.env.K_REVISION}).`
    };
}

const seatAvailable = (execution, event) => {
    return {
        "title": `Open Seat Available in ${event.course}-${event.section}`,
        "color": 5832650,
        "fields": [
            {
                "name": "Course Name",
                "value": event.course,
                "inline": true
            },
            {
                "name": "Section",
                "value": event.section,
                "inline": true
            },
            {
                "name": "Seats Available",
                "value": String(event.new)
            }
        ],
        "footer": generateFooter(execution, event)
    }
}

const sectionRemoved = (execution, event) => {
    return {
        "title": `Section ${event.course}-${event.section} Removed`,
        "color": 16734296,
        "fields": [
            {
                "name": "Course Name",
                "value": event.course,
                "inline": true
            },
            {
                "name": "Section",
                "value": event.section,
                "inline": true
            }
        ],
        "footer": generateFooter(execution, event)
    }
}

const simpleChangeEvent = (title_fn, old_title, new_title, color) => {
    return (execution, event) => (
        {
            "title": title_fn(event),
            "color": color,
            "fields": [
                {
                    "name": "Course Name",
                    "value": String(event.course),
                    "inline": true
                },
                ...(event.section ? [{
                    "name": "Section",
                    "value": event.section,
                    "inline": true
                }] : []),
                {
                    "name": old_title,
                    "value": String(event.old)
                },
                {
                    "name": new_title,
                    "value": String(event.new)
                }
            ],
            "footer": generateFooter(execution, event)
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

const unknownEvent = (execution, event) => {
    return {
        "title": `Unknown event`,
        "color": 16734296,
        "fields": Object.entries(event).map(([k, v]) => ({
            "name": JSON.stringify(k),
            "value": JSON.stringify(v)
        })),
        "footer": generateFooter(execution, event)
    };
}

exports.getDiscordContent = (execution, events) => {
    const mapping = {
        "open_seat_available": seatAvailable,
        "open_seats_changed": openSeatsChanged,
        "total_seats_changed": totalSeatsChanged,
        "instructor_changed": instructorChanged,
        "waitlist_changed": waitlistChanged,
        "holdfile_changed": holdfileChanged,
        "section_removed": sectionRemoved,
        "course_name_changed": courseNameChanged
    }

    return {
        "content": null,
        "embeds": events.map((event) => {
            if (event.type in mapping) {
                return mapping[event.type](execution, event)
            }
            return unknownEvent(execution, event);
        }),
        "username": "Waitlist Watcher",
        "attachments": []
    }
}
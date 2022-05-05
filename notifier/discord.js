const seatAvailable = (event) => {
    return {
        "content": null,
        "embeds": [
            {
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
                        "value": event.new
                    }
                ]
            }
        ],
        "username": "Waitlist Watcher",
        "attachments": []
    }
}

const sectionRemoved = (event) => {
    return {
        "content": null,
        "embeds": [
            {
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
                ]
            }
        ],
        "username": "Waitlist Watcher",
        "attachments": []
    }
}

const simpleSectionChangeEvent = (title_fn, old_title, new_title, color) => {
    return (event) => ({
        "content": null,
        "embeds": [
            {
                "title": title_fn(event),
                "color": color,
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
                        "name": old_title,
                        "value": event.old
                    },
                    {
                        "name": new_title,
                        "value": event.new
                    }
                ]
            }
        ],
        "username": "Waitlist Watcher",
        "attachments": []
    });
}

const totalSeatsChanged = simpleSectionChangeEvent(
    (event) => `Total Seats changed for ${event.course}-${event.section}`,
    "Previous seats available",
    "Seats available",
    5814783
);

const openSeatsChanged = simpleSectionChangeEvent(
    (event) => `Open Seats changed for ${event.course}-${event.section}`,
    "Previous open seats available",
    "Open seats available",
    5814783
);

const instructorChanged = simpleSectionChangeEvent(
    (event) => `Instructor changed for ${event.course}-${event.section}`,
    "Previous Instructor",
    "New Instructor",
    16734296
);

const waitlistChanged = simpleSectionChangeEvent(
    (event) => `Waitlist changed for ${event.course}-${event.section}`,
    "Previous Waitlist Count",
    "New Waitlist Count",
    5814783
);

const holdfileChanged = simpleSectionChangeEvent(
    (event) => `Holdfile changed for ${event.course}-${event.section}`,
    "Previous Holdfile Count",
    "New Holdfile Count",
    5814783
);

const unknownEvent = (event) => {
    return {
        "content": null,
        "embeds": [
            {
                "title": `Unknown event`,
                "color": 16734296,
                "fields": Object.entries(event).map(([k, v]) => ({
                    "name": JSON.stringify(k),
                    "value": JSON.stringify(v)
                }))
            }
        ],
        "username": "Waitlist Watcher",
        "attachments": []
    }
}

exports.getDiscordContent = (event) => {
    const mapping = {
        "open_seat_available": seatAvailable,
        "open_seats_changed": openSeatsChanged,
        "total_seats_changed": totalSeatsChanged,
        "instructor_changed": instructorChanged,
        "waitlist_changed": waitlistChanged,
        "holdfile_changed": holdfileChanged,
        "section_removed": sectionRemoved
    }

    if (event.type in mapping) {
        return mapping[event.type](event);
    }

    return unknownEvent(event);
}
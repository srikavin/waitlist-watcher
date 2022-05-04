const seatAvailable = (event) => {
    return {
        "content": null,
        "embeds": [
            {
                "title": `New Seat Available in ${event.course}-${event.section}`,
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

const totalSeatsChanged = (event) => {
    return {
        "content": null,
        "embeds": [
            {
                "title": `Total Seats Available in ${event.course}-${event.section} Changed`,
                "color": 5814783,
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
                        "name": "Old Seats Available",
                        "value": event.old
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
    if (event.type === "open_seat_available") {
        return seatAvailable(event)
    } else if (event.type === "total_seats_changed") {
        return totalSeatsChanged(event);
    } else {
        return unknownEvent(event);
    }
}
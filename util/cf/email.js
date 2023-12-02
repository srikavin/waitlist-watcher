/**
 * @typedef {import('common/events').CourseEvent} CourseEvent
 */
export default {
    async fetch(request, env) {
        return handle(request, env);
    }
}

async function handle(request, env) {
    console.log(request, env)
    if (request.method === "POST") {
        const params = new URL(request.url).searchParams;
        if(params.get("secret") !== env.EMAIL_SECRET) {
            return new Response("unauthenticated");
        }
        return await handleRequest(params.get("email"), params.get("unsubscribe_key"), await request.json())
    }
    return new Response("bad")
}

/**
 * @param event {CourseEvent | TestNotificationEvent}
 * @returns {string}
 */
function getTitle(event) {
    let eventTitle = "";
    switch (event.type) {
        case "course_added":
            eventTitle = `New course ${event.course} added`
            break;
        case "section_added":
            eventTitle = `New section ${event.course}-${event.section} added`
            break;
        case "course_removed":
            eventTitle = `Course ${event.course} removed`
            break;
        case "course_name_changed":
            eventTitle = `Course ${event.course} name changed from '${event.old}' to '${event.new}'`
            break;
        case "course_description_changed":
            eventTitle = `Course ${event.course} description changed`
            break;
        case "section_removed":
            eventTitle = `Section ${event.course}-${event.section} removed`
            break;
        case "instructor_changed":
            eventTitle = `Instructor for ${event.course}-${event.section} is now '${event.new}'`
            break;
        case "total_seats_changed":
            eventTitle = `Total seats for ${event.course}-${event.section} is now '${event.new}'`
            break;
        case "open_seat_available":
            eventTitle = `Open seat available in ${event.course}-${event.section}`
            break;
        case "open_seats_changed":
            eventTitle = `Number of open seats in ${event.course}-${event.section} is now ${event.new}`
            break;
        case "waitlist_changed":
            eventTitle = `Waitlist count for ${event.course}-${event.section} is now ${event.new}`
            break;
        case "holdfile_changed":
            eventTitle = `Holdfile count for ${event.course}-${event.section} is now ${event.new}`
            break;
        case "meeting_times_changed":
            eventTitle = `Meeting times for ${event.course}-${event.section} have changed`
            break;
        case "test_notification":
            eventTitle = `Test Notification`
            break;
    }

    return eventTitle + ' - Waitlist Watcher'
}

/**
 * @param email {string}
 * @param unsub {string}
 * @param body {CourseEvent}
 * @returns {Promise<Response>}
 */
async function handleRequest(email, unsub, body) {
    let send_request = new Request('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            personalizations: [
                {
                    to: [{email}],
                },
            ],
            from: {
                email: 'noreply.notify.waitlistwatcher@srikavin.me',
                name: 'Waitlist Watcher Notifier',
            },
            subject: getTitle(body),
            content: [
                {
                    type: 'text/html',
                    value: `
                        View the full details on <a href="https://waitlist-watcher.web.app/history/${body.course}${body.section ? '-' + body.section : ''}?semester=${body.semester}">Waitlist Watcher</a>
                        <table>
                            ${Object.entries(body).map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('\n')}
                        </table>
                        
                        This email was sent because you signed up for email notifications at Waitlist Watcher. <br/>
                        <a href="${unsub}">Unsubscribe.</a> 
                `,
                },
            ],
        }),
    })

    console.log(await (await fetch(send_request)).json())

    return new Response();
}
const {initializeApp} = require('firebase-admin/app');
const axios = require("axios");
const webpush = require("web-push");
const {getDatabase} = require("firebase-admin/database");

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

const db = getDatabase();

const VAPID_PUB_KEY = "BIlQ6QPEDRN6KWNvsCz9V9td8vDqO_Q9ZoUX0dAzHAhGVWoAPjjuK9nliB-qpfcN-tcGff0Df536Y2kk9xdYarA";
webpush.setVapidDetails('mailto: contact@srikavin.me', VAPID_PUB_KEY, process.env.VAPID_PRIV_KEY)

exports.notifier = async (message, context) => {
    const parsedData = JSON.parse(Buffer.from(message.data, 'base64').toString());

    const {prefix, previousState, newState, diff} = parsedData.data;

    console.log("Notifying users of changes in ", prefix);

    if (!previousState || !newState) {
        console.warn("PreviousState or newState was invalid!");
        return;
    }

    const previousCourses = previousState.latest;
    const newCourses = newState.latest

    const events = []

    for (let course in previousCourses) {
        if (!(course in newCourses)) {
            // course removed?
            events.push({type: "course_removed", course});
            continue;
        }

        const previousSections = previousCourses[course].sections;
        const newSections = newCourses[course].sections;

        for (let section in previousSections) {
            if (!section in newSections) {
                events.push({type: "section_removed", course, section})
                continue;
            }

            const previousSection = previousSections[section];
            const newSection = newSections[section];

            if (previousSection.instructor !== newSection.instructor) {
                events.push({
                    type: "instructor_changed",
                    course,
                    section,
                    old: previousSection.instructor,
                    new: newSection.instructor
                });
            }

            if (previousSection.totalSeats !== newSection.totalSeats) {
                events.push({
                    type: "total_seats_changed",
                    course,
                    section,
                    old: previousSection.totalSeats,
                    new: newSection.totalSeats
                });
            }

            if (previousSection.openSeats === 0 && newSection.openSeats > 0) {
                events.push({
                    type: "open_seat_available",
                    course,
                    section,
                    old: previousSection.openSeats,
                    new: newSection.openSeats
                });
            }

            if (previousSection.waitlist !== newSection.waitlist) {
                events.push({
                    type: "waitlist_changed",
                    course,
                    section,
                    old: previousSection.waitlist,
                    new: newSection.waitlist
                });
            }

            if (previousSection.holdfile !== newSection.holdfile) {
                events.push({
                    type: "holdfile_changed",
                    course,
                    section,
                    old: previousSection.holdfile,
                    new: newSection.holdfile
                });
            }
        }
    }

    const promises = [];

    for (const event of events) {
        if (!event.section) continue;

        console.log("Notifying users of event type: ", event.type)

        const {type, course, section} = event;

        promises.push(db.ref("section_subscriptions/" + prefix + "/" + section).once('value', (data) => {
            if (!data.exists()) return;

            const subscribers = data.val();

            Object.entries(subscribers).forEach(([key, value]) => {
                db.ref("user_settings/" + key).once('value', (subscription_methods => {
                    if (!subscription_methods.exists()) return;

                    const sub_methods = subscription_methods.val();

                    if (sub_methods.web_hook) {
                        console.log("Notifying", key, "through a web hook");
                        promises.push(axios.post(sub_methods.web_hook, event));
                    }
                    if (sub_methods.web_push) {
                        console.log("Notifying", key, "through a web push");
                        promises.push(webpush.sendNotification(sub_methods.web_push, JSON.stringify({title: 'new update', ...event})));
                    }
                }));
            });
        }));
    }

    const results = await Promise.allSettled(promises);

    results.forEach((e) => console.log(e.result));
}

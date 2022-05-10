const {initializeApp} = require('firebase-admin/app');
const axios = require("axios");
const webpush = require("web-push");
const {getDatabase} = require("firebase-admin/database");
const {getDiscordContent} = require("./discord");

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

const db = getDatabase();

const VAPID_PUB_KEY = "BIlQ6QPEDRN6KWNvsCz9V9td8vDqO_Q9ZoUX0dAzHAhGVWoAPjjuK9nliB-qpfcN-tcGff0Df536Y2kk9xdYarA";
webpush.setVapidDetails('mailto: contact@srikavin.me', VAPID_PUB_KEY, process.env.VAPID_PRIV_KEY)

exports.notifier = async (message, context) => {
    const parsedData = JSON.parse(Buffer.from(message.data, 'base64').toString());

    const {prefix, previousState, newState} = parsedData.data;

    console.log("Notifying users of changes in ", prefix);

    if (!previousState || !newState) {
        console.log("PreviousState or newState was invalid!");
        return;
    }

    const previousCourses = previousState;
    const newCourses = newState;

    const events = [];

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

            if (previousSection.openSeats !== newSection.openSeats) {
                events.push({
                    type: "open_seats_changed",
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

    events.sort((a, b) => a.course.localeCompare(b.course));

    const courseSubscribersCache = {}
    const sectionSubscribersCache = {}

    const cachePromises = [];
    const cacheSeen = new Set();

    for (const event of events) {
        if (!event.section) continue;

        const key = event.course + '-' + event.section;

        if (!cacheSeen.has(key)) {
            cachePromises.push((async () => {
                sectionSubscribersCache[key] = await db.ref(`section_subscriptions/${event.course}/${event.section}`).once('value');
            })())
            cacheSeen.add(key);
        }

        if (!cacheSeen.has(event.course)) {
            cachePromises.push((async () => {
                courseSubscribersCache[event.course] = await db.ref(`course_subscriptions/${event.course}/`).once('value');
            })());
            cacheSeen.add(key);
        }
    }

    const everythingSubscribers = (await db.ref(`everything_subscriptions/`).once('value')).val() || {};

    await Promise.all(cachePromises);

    const promises = [];
    const webhookPromises = [];
    const discordBatch = {}


    for (const event of events) {
        if (!event.section) continue;

        const {type, course, section} = event;

        console.log("Notifying users of event ", type, " for ", course, section);

        let [sectionSubscribers, courseSubscribers] = [sectionSubscribersCache[event.course + '-' + event.section], courseSubscribersCache[event.course]];

        sectionSubscribers = sectionSubscribers.val() || {};
        courseSubscribers = courseSubscribers.val() || {};

        let subscribers = [];
        subscribers = subscribers.concat(Object.keys(sectionSubscribers));
        subscribers = subscribers.concat(Object.keys(courseSubscribers));
        subscribers = subscribers.concat(Object.keys(everythingSubscribers));

        subscribers = [...new Set(subscribers)]

        console.log("Found subscribers", subscribers);

        for (const key of subscribers) {
            if (!(sectionSubscribers?.[key]?.[type] === true
                || courseSubscribers?.[key]?.[type] === true
                || everythingSubscribers?.[key]?.[type] === true)) {
                return;
            }

            const subscription_methods = await db.ref("user_settings/" + key).once('value');
            if (!subscription_methods.exists()) return;

            const sub_methods = subscription_methods.val();

            if (sub_methods.web_hook) {
                console.log("Notifying", key, "through a web hook");
                webhookPromises.push(axios.post(sub_methods.web_hook, event));
            }
            if (sub_methods.web_push) {
                console.log("Notifying", key, "through a web push");
                webhookPromises.push(webpush.sendNotification(sub_methods.web_push, JSON.stringify({title: 'new update', ...event})));
            }
            if (sub_methods.discord) {
                if (discordBatch[sub_methods.discord] === undefined) {
                    discordBatch[sub_methods.discord] = [[]]
                }

                let batches = discordBatch[sub_methods.discord];

                if (batches[batches.length - 1].length === 10) {
                    batches.push([])
                }

                batches[batches.length - 1].push(event);
            }
        }
    }

    const results = await Promise.allSettled(promises);

    for (const [discordHookUrl, batches] of Object.entries(discordBatch)) {
        console.log("Notifying discord webhook with ", batches.length, " batches")
        batches.forEach((events) => {
            webhookPromises.push(axios.post(discordHookUrl, getDiscordContent(events), {
                headers: {
                    "Authorization": `Bot ${process.env.DISCORD_CLIENT_SECRET}`
                }
            }));
        });
    }

    const webhookResults = await Promise.allSettled(webhookPromises);

    results.forEach((e) => {
        if (e.status === 'rejected') {
            console.error("results", "rejected", e.reason)
        }
    });

    webhookResults.forEach((e) => {
        if (e.status === 'rejected') {
            console.error("webhookResults", "rejected", e.reason.message)
        }
    });
}

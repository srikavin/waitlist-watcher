import type {CloudEvent} from "firebase-functions/v2";
import type {MessagePublishedData} from "firebase-functions/v2/pubsub";

import {rtdb} from "../common";
import {publishNotifications} from "./send";
import {notify_discord_server} from "./discord_server_notifier";

export const sendNotifications = async (event: CloudEvent<MessagePublishedData>) => {
    const parsedData = JSON.parse(Buffer.from(event.data.message.data, 'base64').toString());

    const {prefix, events, semester: batchSemester} = parsedData.data;

    if (events === undefined) {
        console.log("Likely got old message. Skipping.")
        return;
    }

    console.log(process.env.VAPID_PRIV_KEY);

    console.log("Notifying users of changes in ", prefix, events.length);

    const courseSubscribersCache: Record<string, any> = {}
    const sectionSubscribersCache: Record<string, any> = {}

    const cachePromises = [];
    const cacheSeen = new Set();
    const semester = batchSemester ?? events[0]?.semester;
    if (!semester) {
        console.warn("Missing semester for event batch. Skipping notifications.");
        return;
    }

    for (const event of events) {
        let key = `${semester}:${event.course}`;
        if (event.section) {
            key += '-' + event.section;
        }

        if (!cacheSeen.has(key) && event.section) {
            cachePromises.push((async () => {
                sectionSubscribersCache[key] = await rtdb.ref(`section_subscriptions/${semester}/${event.course}/${event.section}`).once('value');
            })())
            cacheSeen.add(key);
        }

        const courseKey = `${semester}:${event.course}`;
        if (!cacheSeen.has(courseKey)) {
            cachePromises.push((async () => {
                courseSubscribersCache[courseKey] = await rtdb.ref(`course_subscriptions/${semester}/${event.course}/`).once('value');
            })());
            cacheSeen.add(courseKey);
        }
    }

    const departmentSubscribers = (await rtdb.ref(`department_subscriptions/${semester}/${prefix}`).once('value')).val() || {};
    const everythingSubscribers = (await rtdb.ref(`everything_subscriptions/${semester}`).once('value')).val() || {};

    await Promise.all(cachePromises);

    const promises: Promise<any>[] = [];


    promises.push(notify_discord_server(prefix, events));

    for (const event of events) {
        const {type} = event;

        let sectionSubscribers: any = {};
        if (event.section) {
            sectionSubscribers = sectionSubscribersCache[`${semester}:${event.course}-${event.section}`];
            sectionSubscribers = sectionSubscribers.val() || {};
        }

        let courseSubscribers = courseSubscribersCache[`${semester}:${event.course}`];
        courseSubscribers = courseSubscribers.val() || {};

        let subscribers: any = [];
        subscribers = subscribers.concat(Object.keys(sectionSubscribers));
        subscribers = subscribers.concat(Object.keys(courseSubscribers));
        subscribers = subscribers.concat(Object.keys(departmentSubscribers));
        subscribers = subscribers.concat(Object.keys(everythingSubscribers));

        subscribers = [...new Set(subscribers)]

        console.log("Found subscribers", subscribers);

        for (const key of subscribers) {
            const defaultsChannels = {
                "course_removed": true,
                "course_added": true,
                "course_name_changed": true,
                "course_description_changed": true,
                "meeting_times_changed": true,
                "section_removed": true,
                "section_added": true,
                "instructor_changed": true,
            };

            const merged = {
                ...defaultsChannels,
                ...everythingSubscribers?.[key],
                ...departmentSubscribers?.[key],
                ...courseSubscribers?.[key],
                ...sectionSubscribers?.[key],
            };

            if (merged[type] !== true) {
                continue;
            }

            const subscription_methods = await rtdb.ref("user_settings/" + key).once('value');
            if (!subscription_methods.exists()) continue;

            const sub_methods = subscription_methods.val();
            promises.push(publishNotifications(sub_methods, key, event));
        }
    }

    const results = await Promise.allSettled(promises);

    results.forEach((e) => {
        if (e.status === 'rejected') {
            console.error("results", "rejected", e.reason)
        }
    });
}

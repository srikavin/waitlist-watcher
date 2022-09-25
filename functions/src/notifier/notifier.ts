import axios from "axios";
import * as webpush from "web-push";

import type {CloudEvent} from "firebase-functions/v2";
import type {MessagePublishedData} from "firebase-functions/v2/pubsub";
import {CourseEvent} from "../types";

import {discordWebhookQueue, rtdb, tasksClient} from "../common";
import {getDiscordContent} from "./discord";

const VAPID_PUB_KEY = "BIlQ6QPEDRN6KWNvsCz9V9td8vDqO_Q9ZoUX0dAzHAhGVWoAPjjuK9nliB-qpfcN-tcGff0Df536Y2kk9xdYarA";

export const sendNotifications = async (event: CloudEvent<MessagePublishedData>) => {
    const parsedData = JSON.parse(Buffer.from(event.data.message.data, 'base64').toString());

    const {prefix, events} = parsedData.data;

    if (events === undefined) {
        console.log("Likely got old message. Skipping.")
        return;
    }

    webpush.setVapidDetails('mailto: contact@srikavin.me', VAPID_PUB_KEY, process.env.VAPID_PRIV_KEY!)
    console.log(process.env.VAPID_PRIV_KEY);

    console.log("Notifying users of changes in ", prefix, events.length);

    const courseSubscribersCache: Record<string, any> = {}
    const sectionSubscribersCache: Record<string, any> = {}

    const cachePromises = [];
    const cacheSeen = new Set();

    for (const event of events) {
        let key = event.course;
        if (event.section) {
            key += '-' + event.section;
        }

        if (!cacheSeen.has(key) && event.section) {
            cachePromises.push((async () => {
                sectionSubscribersCache[key] = await rtdb.ref(`section_subscriptions/${event.course}/${event.section}`).once('value');
            })())
            cacheSeen.add(key);
        }

        if (!cacheSeen.has(event.course)) {
            cachePromises.push((async () => {
                courseSubscribersCache[event.course] = await rtdb.ref(`course_subscriptions/${event.course}/`).once('value');
            })());
            cacheSeen.add(key);
        }
    }

    const departmentSubscribers = (await rtdb.ref(`department_subscriptions/${prefix}`).once('value')).val() || {};
    const everythingSubscribers = (await rtdb.ref(`everything_subscriptions/`).once('value')).val() || {};

    await Promise.all(cachePromises);

    const promises: Promise<any>[] = [];
    const webhookPromises = [];
    const discordBatch: Record<string, Array<Array<CourseEvent>>> = {}


    for (const event of events) {
        const {type} = event;

        let sectionSubscribers: any = {};
        if (event.section) {
            sectionSubscribers = sectionSubscribersCache[event.course + '-' + event.section];
            sectionSubscribers = sectionSubscribers.val() || {};
        }

        let courseSubscribers = courseSubscribersCache[event.course];
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
                "section_removed": true,
                "section_added": true,
                "instructor_changed": true
            };

            const merged = {
                ...defaultsChannels,
                ...everythingSubscribers?.[key],
                ...departmentSubscribers?.[key],
                ...courseSubscribers?.[key],
                ...sectionSubscribers?.[key],
            };

            console.log("merged preferences", JSON.stringify(merged));

            if (merged[type] !== true) {
                continue;
            }

            const subscription_methods = await rtdb.ref("user_settings/" + key).once('value');
            if (!subscription_methods.exists()) continue;

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

    const taskPromises: Array<Promise<any>> = [];

    for (const [discordHookUrl, batches] of Object.entries(discordBatch)) {
        console.log("Notifying discord webhook with ", batches.length, " batches")

        for (const batchEvents of batches) {
            taskPromises.push(tasksClient.createTask({
                parent: discordWebhookQueue,
                task: {
                    httpRequest: {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bot ${process.env.DISCORD_CLIENT_SECRET}`
                        },
                        httpMethod: 'POST',
                        url: discordHookUrl,
                        body: Buffer.from(JSON.stringify(getDiscordContent(batchEvents))).toString('base64')
                    }
                }
            }));
        }
    }

    const results = await Promise.allSettled(promises);
    const webhookResults = await Promise.allSettled(webhookPromises);
    const taskResults = await Promise.allSettled(taskPromises);

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

    taskResults.forEach((e) => {
        if (e.status === 'rejected') {
            console.error("taskResults", "rejected", e.reason)
        }
    });
}

import {
    discordWebhookQueue,
    discordWebhookQueueShardCount,
    shardQueueUrl,
    tasksClient,
    webhookQueue,
    webhookQueueShardCount
} from "../common";
import {getDiscordContent} from "./discord";
import {CourseEvent, TestNotificationEvent} from "@/common/events";
import * as webpush from "web-push";
import {PushSubscription} from "web-push";
import axios from "axios";

export const sendDiscordNotification = async (webhook_url: string, event: CourseEvent | TestNotificationEvent) => {
    return await tasksClient.createTask({
        parent: discordWebhookQueue(shardQueueUrl(webhook_url, discordWebhookQueueShardCount)),
        task: {
            httpRequest: {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bot ${process.env.DISCORD_CLIENT_SECRET}`
                },
                httpMethod: 'POST',
                url: webhook_url,
                body: Buffer.from(JSON.stringify(getDiscordContent([event]))).toString('base64')
            }
        }
    });
}

export const sendWebhookNotification = async (webhook_url: string, event: CourseEvent | TestNotificationEvent) => {
    return await tasksClient.createTask({
        parent: webhookQueue(shardQueueUrl(webhook_url, webhookQueueShardCount)),
        task: {
            httpRequest: {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Application': 'Waitlist Watcher Webhook'
                },
                httpMethod: 'POST',
                url: webhook_url,
                body: Buffer.from(JSON.stringify(event)).toString('base64'),
            }
        }
    });
}

export const sendWebPushNotification = async (subscription: PushSubscription, event: CourseEvent | TestNotificationEvent) => {
    const VAPID_PUB_KEY = "BIlQ6QPEDRN6KWNvsCz9V9td8vDqO_Q9ZoUX0dAzHAhGVWoAPjjuK9nliB-qpfcN-tcGff0Df536Y2kk9xdYarA";
    webpush.setVapidDetails('mailto: contact@srikavin.me', VAPID_PUB_KEY, process.env.VAPID_PRIV_KEY!);

    const requestDetails = webpush.generateRequestDetails(subscription, JSON.stringify({...event}))
    return await tasksClient.createTask({
        parent: webhookQueue(shardQueueUrl(requestDetails.endpoint, webhookQueueShardCount)),
        task: {
            httpRequest: {
                headers: {
                    ...requestDetails.headers
                },
                httpMethod: requestDetails.method,
                url: requestDetails.endpoint,
                body: requestDetails.body.toString('base64'),
            }
        }
    });
}

export const sendEmailNotification = async (email: string, event: CourseEvent | TestNotificationEvent, key: string) => {
    const unsubscribe_url = "https://us-east4-waitlist-watcher.cloudfunctions.net/email_unsubscribe?" + new URLSearchParams({
        email, id: key
    });

    return await axios.post("https://cf.waitlistwatcher.srikavin.me/?" + new URLSearchParams({
        email: email,
        secret: process.env.EMAIL_SECRET!,
        unsubscribe_key: unsubscribe_url
    }), event);
}

export const publishNotifications = async (sub_methods: any, key: string, event: CourseEvent | TestNotificationEvent) => {
    const promises = [];
    if (sub_methods.web_hook) {
        console.log("Notifying", key, "through a web hook");
        promises.push(sendWebhookNotification(sub_methods.web_hook, event));
    }
    if (sub_methods.web_push) {
        console.log("Notifying", key, "through a web push");
        promises.push(sendWebPushNotification(sub_methods.web_push, event));
    }
    if (sub_methods.discord) {
        console.log("Notifying", key, "through a discord web hook")
        promises.push(sendDiscordNotification(sub_methods.discord, event));
    }
    if (sub_methods.email) {
        console.log("Notifying", key, "through an email")
        promises.push(sendEmailNotification(sub_methods.email, event, key));
    }

    return Promise.all(promises);
}
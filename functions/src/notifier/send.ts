import {
    discordWebhookQueue,
    discordWebhookQueueShardCount,
    shardQueueUrl,
    tasksClient,
    webhookQueue,
    webhookQueueShardCount
} from "../common";
import {getDiscordContent} from "./discord";
import {CourseEvent} from "../types";
import * as webpush from "web-push";
import {PushSubscription} from "web-push";

export const sendDiscordNotification = async (webhook_url: string, event: CourseEvent) => {
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

export const sendWebhookNotification = async (webhook_url: string, event: CourseEvent) => {
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

export const sendWebPushNotification = async (subscription: PushSubscription, event: CourseEvent) => {
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

export const publishNotifications = async (sub_methods: any, key: string, event: CourseEvent) => {
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

    return Promise.all(promises);
}
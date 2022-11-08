import {
    discordWebhookQueue,
    discordWebhookQueueShardCount,
    shardQueueUrl,
    tasksClient,
    webhookQueueShardCount
} from "../common";
import {getDiscordContent} from "./discord";
import {CourseEvent} from "../types";
import * as webpush from "web-push";
import {PushSubscription} from "web-push";

export const sendDiscordNotification = async (webhook_url: string, event: CourseEvent) => {
    return await tasksClient.createTask({
        parent: discordWebhookQueue(shardQueueUrl(webhook_url, webhookQueueShardCount)),
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
        parent: discordWebhookQueue(shardQueueUrl(webhook_url, discordWebhookQueueShardCount)),
        task: {
            httpRequest: {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Application': 'Waitlist Watcher Webhook'
                },
                httpMethod: 'POST',
                url: webhook_url,
                body: Buffer.from(JSON.stringify(event)).toString('base64')
            }
        }
    });
}

export const sendWebPushNotification = async (subscription: PushSubscription, event: CourseEvent) => {
    return webpush.sendNotification(subscription, JSON.stringify({...event}))
}

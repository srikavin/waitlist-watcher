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

const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

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

export const sendEmailNotification = async (email: string, event: CourseEvent) => {
    const msg = {
        to: email, // Change to your recipient
        from: 'notifier.noreply@waitlistwatcher.srikavin.me', // Change to your verified sender
        subject: `Waitlist Watcher: ${event.course} Course Update`,
        html: `A course event occurred: ${JSON.stringify(event)}. <br />` +
            `View the event on <a href="https://waitlist-watcher.web.app/history/${event.course}?semester=${event.semester}">Waitlist Watcher</a>`,
    }

    return sgMail.send(msg);
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
    if (sub_methods.email) {
        console.log("Notifying", key, "through an email")
        promises.push(sendEmailNotification(sub_methods.email, event));
    }

    return Promise.all(promises);
}
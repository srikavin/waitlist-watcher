import {rtdb} from "../common";
import {sendDiscordNotification} from "./send";

export const notify_discord_server = async (prefix: string, events: any[]) => {
    const channel_webhook_urls = await (rtdb.ref("discord_server_channels/" + prefix).get());
    if (!channel_webhook_urls.exists())
        return;

    const promises = [];
    for (const event of events) {
        for (const channel_webhook_url of channel_webhook_urls.val() as string[])
            promises.push(sendDiscordNotification(channel_webhook_url, event));
    }
    await Promise.all(promises);
}

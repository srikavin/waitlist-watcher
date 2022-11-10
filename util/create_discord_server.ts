import {ChannelType, Client, GatewayIntentBits} from "discord.js";
import config from '../functions/src/config.json'

import {getDatabase} from "firebase-admin/database";
import {initializeApp} from "firebase-admin/app";

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

const realtime_db = getDatabase();

const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string;
const APPLICATION_ID = "973034033669894165";
const CLIENT_PUB_KEY = "3b6baac3bd23cfa27ce6d45652d0c0c93b1f61900fe1a0986f0323323cff4030";

const GUILD_ID = process.env.GUILD_ID as string;

const client = new Client({intents: [GatewayIntentBits.Guilds]});

const subscription_methods = {
    course_added: true,
    section_added: true,
    course_removed: true,
    section_removed: true,
    course_name_changed: true,
    course_description_changed: true,
    instructor_changed: true,
    total_seats_changed: true,
    open_seat_available: true,
    open_seats_changed: true,
    waitlist_changed: true,
    holdfile_changed: true,
    meeting_times_changed: true
};

const subscribeToDepartment = async (userId: string, department: string, channels: Record<string, boolean> = subscription_methods) => {
    const updates: Record<string, any> = {}

    updates[`department_subscriptions/${department}/${userId}`] = channels;
    updates[`user_settings/${userId}/subscriptions/${department}`] = channels;

    await realtime_db.ref('/').update(updates);
}


(async () => {
    await client.login(CLIENT_SECRET);

    const guild = await client.guilds.fetch(GUILD_ID);

    await guild.channels.fetch();

    for (const prefix of config.prefixes) {
        let existing = guild.channels.cache.find(e => e.name.toUpperCase() === prefix);
        while (existing) {
            const discordUserId = `${guild.id}@${existing.id}@guild@discord`;
            await realtime_db.ref(`user_settings/${discordUserId}/discord`).remove();
            await realtime_db.ref(`department_subscriptions/${prefix}/${discordUserId}`).remove();
            await realtime_db.ref(`user_settings/${discordUserId}/subscriptions/${prefix}`).remove();
            await existing.delete();
            await existing.parent?.delete();

            existing = guild.channels.cache.find(e => e.name.toUpperCase() === prefix);
        }

        let parent = guild.channels.cache.find(e => e.name === `departments (${prefix.at(0)})`);
        if (!parent) {
            parent = await guild.channels.create({
                type: ChannelType.GuildCategory,
                name: `departments (${prefix.at(0)})`
            });
        }


        const channel = await guild.channels.create({
            name: prefix,
            parent: parent!.id
        });

        const discordUserId = `${guild.id}@${channel.id}@guild@discord`;
        await realtime_db.ref(`user_settings/${discordUserId}/discord`)
            .set(`https://discord.com/api/v8/channels/${channel.id}/messages`);
        await subscribeToDepartment(discordUserId, prefix);
    }
})();

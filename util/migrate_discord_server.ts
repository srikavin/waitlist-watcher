import {getDatabase} from "firebase-admin/database";
import {initializeApp} from "firebase-admin/app";

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

const realtime_db = getDatabase();

(async () => {
    const user_settings: Record<string, any> = (await realtime_db.ref(`user_settings/`).get()).val();

    await Promise.all(Object.entries(user_settings).map(async ([user, settings]) => {
        if (!(user.endsWith("@guild@discord") && user.length > 45)) {
            return;
        }

        const subscriptionsBySemester = settings['subscriptions'] ?? {};
        const semester = Object.keys(subscriptionsBySemester)[0];
        if (!semester) return;
        let subs = Object.keys(subscriptionsBySemester[semester] ?? {});
        if (subs.length != 1) throw Error("> 1 subscription");

        let prefix = subs[0];

        if (prefix === 'everything') return;

        await realtime_db.ref("discord_server_channels/" + prefix).set([settings['discord']])
        await realtime_db.ref("department_subscriptions/" + semester + "/" + prefix + "/" + user).remove();
        await realtime_db.ref("user_settings/" + user).remove();

        console.log(user, subs[0], settings['discord']);
    }));

    // const discordUserId = `${guild.id}@${channel.id}@guild@discord`;
    // await realtime_db.ref(`user_settings/${discordUserId}/discord`)
    //     .set(`https://discord.com/api/v8/channels/${channel.id}/messages`);
    // await subscribeToDepartment(discordUserId, prefix);
})();

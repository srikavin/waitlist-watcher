import {rtdb} from "../common";
import {publishNotifications} from "./send";
import {CallableContext} from "firebase-functions/v1/https";

export async function testNotify(data: any, context: CallableContext) {
    const userid = context.auth?.uid ?? false;

    if (!userid) {
        return {success: false, error: "invalid userid"};
    }

    const subscription_methods = await rtdb.ref("user_settings/" + userid).once('value');
    if (!subscription_methods.exists()) return;

    const sub_methods = subscription_methods.val();

    await publishNotifications(sub_methods, userid, {
        type: "test_notification",
        id: "TEST-EVENT-ID",
        timestamp: "timestamp",
        title: "This is what an event looks like",
        semester: "202301",
        course: "TEST",
        section: "101",
        new: "New Value",
        old: "Old Value",
    });

    return {success: true};
}

import {rtdb} from "./common";
import {CallableContext} from "firebase-functions/v1/https";

export async function countWatchers(data: any, context: CallableContext) {
    let key;

    if (data['section']) {
        key = rtdb.ref('section_subscriptions').child(data['course']).child(data['section']);
    } else {
        key = rtdb.ref('course_subscriptions').child(data['course']);
    }

    console.log(data);

    if (!key) {
        return {success: false, error: 'invalid request'};
    }

    const contents = Object.keys((await rtdb.ref(key).once('value')).val() ?? {});

    return {success: true, count: contents.length};
}

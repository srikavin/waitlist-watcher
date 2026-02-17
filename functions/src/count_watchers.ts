import {rtdb} from "./common";
import {CallableContext} from "firebase-functions/v1/https";

export async function countWatchers(data: any, context: CallableContext) {
    const semester: string | undefined = data.semester;
    const course: string | undefined = data.course;
    const section: string | undefined = data.section;
    let key;

    if (!semester || !course) {
        return {success: false, error: 'missing semester or course'};
    }

    if (section) {
        key = rtdb.ref('section_subscriptions').child(semester).child(course).child(section);
    } else {
        key = rtdb.ref('course_subscriptions').child(semester).child(course);
    }

    console.log(data);

    if (!key) {
        return {success: false, error: 'invalid request'};
    }

    const contents = Object.keys((await rtdb.ref(key).once('value')).val() ?? {});

    return {success: true, count: contents.length};
}

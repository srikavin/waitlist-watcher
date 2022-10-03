import type {EventContext} from "firebase-functions";
import type {QueryDocumentSnapshot} from "firebase-admin/firestore";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

export const onNewCourse = (semester: string) => async (snapshot: QueryDocumentSnapshot, context: EventContext) => {
    const db = getFirestore();

    await db.doc(`course_listing/${semester}`).set({
        courses: FieldValue.arrayUnion(snapshot.id)
    }, {merge: true});
}

export const onRemoveCourse = (semester: string) => async (snapshot: QueryDocumentSnapshot, context: EventContext) => {
    const db = getFirestore();

    await db.doc(`course_listing/${semester}`).set({
        removed_courses: FieldValue.arrayUnion(snapshot.id)
    }, {merge: true});
}

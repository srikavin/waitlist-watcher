import type {EventContext, Change} from "firebase-functions";
import type {QueryDocumentSnapshot, DocumentSnapshot} from "firebase-admin/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

export const onNewCourse = (semester: string) => async (change: Change<DocumentSnapshot>, context: EventContext) => {
    const db = getFirestore();

    await db.doc(`course_listing/${semester}`).set({
        courses: FieldValue.arrayUnion(change.after.id)
    }, {merge: true});
}

export const onRemoveCourse = (semester: string) => async (snapshot: QueryDocumentSnapshot, context: EventContext) => {
    const db = getFirestore();

    await db.doc(`course_listing/${semester}`).set({
        removed_courses: FieldValue.arrayUnion(snapshot.id)
    }, {merge: true});
}

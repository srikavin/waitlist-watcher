import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import FieldValue = firestore.FieldValue;

initializeApp();

const db = getFirestore();
db.settings({ignoreUndefinedProperties: true});

(async () => {
    const coursesAndSections202208 = (await db.collection('events').listDocuments())
        .map(e => e.id);

    console.log("202208", coursesAndSections202208.length)

    await db.doc(`course_listing/202208`).set({
        courses: FieldValue.arrayUnion(...coursesAndSections202208)
    }, {merge: true});


    const coursesAndSections202301 = (await db.collection('events202301').listDocuments())
        .map(e => e.id);
    console.log("202301", coursesAndSections202301.length)

    await db.doc(`course_listing/202301`).set({
        courses: FieldValue.arrayUnion(...coursesAndSections202301)
    }, {merge: true});
})();


export default {};

import * as functions from "firebase-functions";
import {initializeApp} from "firebase-admin/app";
import {onNewCourse, onRemoveCourse} from "./course_listing";

initializeApp();

export const onCourseAddition202208 =
    functions.region('us-east4')
        .firestore.document("events/{course_name}").onWrite(onNewCourse("202208"));

export const onCourseAddition202301 =
    functions.region('us-east4')
        .firestore.document("events202301/{course_name}").onWrite(onNewCourse("202301"));

export const onCourseRemove202208 =
    functions.region('us-east4')
        .firestore.document("events/{course_name}").onDelete(onRemoveCourse("202208"));

export const onCourseRemove202301 =
    functions.region('us-east4')
        .firestore.document("events202301/{course_name}").onDelete(onRemoveCourse("202301"));

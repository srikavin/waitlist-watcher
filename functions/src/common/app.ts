import {initializeApp} from "firebase-admin/app";

export const app = initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

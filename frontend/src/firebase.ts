import {getFirestore} from "firebase/firestore";
import {initializeApp} from "firebase/app";
import {getAuth} from "firebase/auth";
import {getDatabase} from "firebase/database";


const firebaseConfig = {
    apiKey: "AIzaSyCEOk5uM6dXkaedaGKrayqBGEjHz818hOY",
    authDomain: "waitlist-watcher.firebaseapp.com",
    projectId: "waitlist-watcher",
    storageBucket: "waitlist-watcher.appspot.com",
    messagingSenderId: "315630446423",
    appId: "1:315630446423:web:f5ba6e6dc335eeac6a0012",
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const realtime_db = getDatabase(firebaseApp);

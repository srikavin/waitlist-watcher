import {useContext, useEffect, useState} from "react";
import {doc, onSnapshot} from "firebase/firestore";
import {db} from "../firebase";
import {SemesterContext} from "../context/SemesterContext";

export function useCourseEvents(name: string) {
    const {semester, semesters} = useContext(SemesterContext);

    const [events, setEvents] = useState<Array<any>>([])

    useEffect(() => {
        return onSnapshot(doc(db, "events" + semesters[semester].suffix, name), (doc) => {
            const eventMap: Record<string, any> = doc.get("events");
            setEvents(Object.values(eventMap)
                .sort((a, b) => {
                    if (a.timestamp === b.timestamp) return a.type.localeCompare(b.type);
                    return -new Date(a.timestamp) + +new Date(b.timestamp);
                }));
        });
    }, [name, semesters, semester]);

    return events;
}
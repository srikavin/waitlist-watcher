import {useEffect, useState} from "react";
import {doc, onSnapshot} from "firebase/firestore";
import {FSEventsConverter} from "@/common/firestore";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";

export function useCourseEvents(name: string) {
    const {semester, semesters} = useSemesterContext();

    const [events, setEvents] = useState<Array<any>>([])

    useEffect(() => {
        return onSnapshot(doc(semester.eventsCollection, name).withConverter(FSEventsConverter), (doc) => {
            const eventMap = doc.data()!.events;
            setEvents(Object.values(eventMap)
                .sort((a, b) => {
                    if (a.timestamp === b.timestamp) return a.type.localeCompare(b.type);
                    return -new Date(a.timestamp) + +new Date(b.timestamp);
                }));
        });
    }, [name, semesters, semester]);

    return events;
}
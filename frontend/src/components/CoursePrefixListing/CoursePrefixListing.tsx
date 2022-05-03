import {db} from "../../firebase";
import {collection, getDocs} from "firebase/firestore";
import {useContext, useEffect, useState} from "react";
import {AuthContext} from "../../context/AuthContext";
import {CourseListing} from "../CourseListing/CourseListing";
import {Card, EmptyState, Link, Spinner, Text} from "evergreen-ui";

export function CoursePrefixListing() {
    const {auth: isAuthed} = useContext(AuthContext);

    const [courses, setCourses] = useState<string[]>([]);

    useEffect(() => {
        if (!isAuthed) return;

        void async function () {
            let newCourses: string[] = [];

            const coursesSnapshot = await getDocs(collection(db, "course_data"));

            coursesSnapshot.forEach((e) => {
                newCourses.push(e.id);
            });

            setCourses(newCourses);
        }();
    }, [isAuthed])

    if (courses.length === 0) {
        return (
            <EmptyState
                title="Fetching list of departments"
                icon={<Spinner/>}
                iconBgColor="#EDEFF5"
                description="This might take a couple seconds."
            />
        );
    }

    return (
        <div style={{columnCount: 10}}>
            {courses.map((e) => (
                <div key={e}>
                    <Link href={`/department/${e}`} color={"neutral"}>{e}</Link>
                </div>
            ))}
        </div>
    );
}
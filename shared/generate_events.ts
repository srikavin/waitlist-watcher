import {CourseEvent} from "./types";

export function generateEvents(crypto: any, previousCourses: any, newCourses: any, timestamp: string): Array<CourseEvent> {
    const events = [];

    for (let course in newCourses) {
        if (!previousCourses[course]) {
            // course removed?
            events.push({type: "course_added", course, title: newCourses[course].title});
        }

        const newSections = newCourses[course].sections;

        for (let section in newSections) {
            if (!previousCourses[course] || !previousCourses[course].sections[section]) {
                events.push({type: "section_added", course, title: newCourses[course].title, section})
            }
        }
    }

    for (let course in previousCourses) {
        if (!newCourses[course]) {
            // course removed?
            events.push({type: "course_removed", course, title: previousCourses[course].title});
            continue;
        }

        const previousCourse = previousCourses[course];
        const newCourse = newCourses[course];

        if (previousCourse.name !== newCourse.name) {
            events.push({
                type: "course_name_changed",
                course,
                title: newCourse.name,
                old: previousCourse.name,
                new: newCourse.name
            });
        }

        const title = newCourse.name;

        const previousSections = previousCourses[course].sections;
        const newSections = newCourses[course].sections;

        for (let section in previousSections) {
            if (!newSections[section]) {
                events.push({type: "section_removed", course, title, section})
                continue;
            }

            const previousSection = previousSections[section];
            const newSection = newSections[section];

            if (previousSection.instructor !== newSection.instructor) {
                events.push({
                    type: "instructor_changed",
                    course,
                    title,
                    section,
                    old: previousSection.instructor,
                    new: newSection.instructor
                });
            }

            if (previousSection.totalSeats !== newSection.totalSeats) {
                events.push({
                    type: "total_seats_changed",
                    course,
                    title,
                    section,
                    old: previousSection.totalSeats,
                    new: newSection.totalSeats
                });
            }

            if (previousSection.openSeats === 0 && newSection.openSeats > 0) {
                events.push({
                    type: "open_seat_available",
                    course,
                    title,
                    section,
                    old: previousSection.openSeats,
                    new: newSection.openSeats
                });
            }

            if (previousSection.openSeats !== newSection.openSeats) {
                events.push({
                    type: "open_seats_changed",
                    course,
                    title,
                    section,
                    old: previousSection.openSeats,
                    new: newSection.openSeats
                });
            }

            if (previousSection.waitlist !== newSection.waitlist) {
                events.push({
                    type: "waitlist_changed",
                    course,
                    title,
                    section,
                    old: previousSection.waitlist,
                    new: newSection.waitlist
                });
            }

            if (previousSection.holdfile !== newSection.holdfile) {
                events.push({
                    type: "holdfile_changed",
                    course,
                    title,
                    section,
                    old: previousSection.holdfile,
                    new: newSection.holdfile
                });
            }
        }
    }

    events.sort((a, b) => a.course.localeCompare(b.course));

    return events.map(e => ({
        ...e,
        id: crypto.createHash('sha1').update(e.course + e.type + timestamp + e.section).digest('hex'),
        timestamp: timestamp
    })) as Array<CourseEvent>;
}
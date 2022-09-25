import * as crypto from "crypto";
import {CourseEvent} from "../types";
import {ScrapedCourse, ScrapedOutput, ScrapedSection} from "./scraper";

function emitCourseEvents(events: Array<Partial<CourseEvent>>, course: string, title: string,
                          previousCourse: Partial<ScrapedCourse>, newCourse: ScrapedCourse) {
    if (previousCourse.name !== newCourse.name) {
        events.push({
            type: "course_name_changed",
            course,
            title: newCourse.name,
            old: previousCourse.name,
            new: newCourse.name,
        });
    }
}

function emitSectionEvents(events: Array<Partial<CourseEvent>>, course: string, title: string, section: string,
                           previousSection: Partial<ScrapedSection>, newSection: ScrapedSection) {
    if (previousSection.instructor !== newSection.instructor) {
        events.push({
            type: "instructor_changed",
            course,
            title,
            section,
            old: previousSection.instructor,
            new: newSection.instructor,
        });
    }

    if (previousSection.totalSeats !== newSection.totalSeats) {
        events.push({
            type: "total_seats_changed",
            course,
            title,
            section,
            old: previousSection.totalSeats,
            new: newSection.totalSeats,
        });
    }

    if (previousSection.openSeats === 0 && newSection.openSeats > 0) {
        events.push({
            type: "open_seat_available",
            course,
            title,
            section,
            old: previousSection.openSeats,
            new: newSection.openSeats,
        });
    }

    if (previousSection.openSeats !== newSection.openSeats) {
        events.push({
            type: "open_seats_changed",
            course,
            title,
            section,
            old: previousSection.openSeats,
            new: newSection.openSeats,
        });
    }

    if (previousSection.waitlist !== newSection.waitlist) {
        events.push({
            type: "waitlist_changed",
            course,
            title,
            section,
            old: previousSection.waitlist,
            new: newSection.waitlist,
        });
    }

    if (previousSection.holdfile !== newSection.holdfile) {
        events.push({
            type: "holdfile_changed",
            course,
            title,
            section,
            old: previousSection.holdfile,
            new: newSection.holdfile,
        });
    }
}

export const generateEvents = (previousCourses: ScrapedOutput, newCourses: ScrapedOutput, timestamp: string, semester: string) => {
    const events: Array<Partial<CourseEvent>> = [];

    for (const course in newCourses) {
        if (!previousCourses[course]) {
            events.push({type: "course_added", course, title: newCourses[course].name});
            emitCourseEvents(events, course, newCourses[course].name, {}, newCourses[course]);
        }

        const newSections = newCourses[course].sections;

        for (const section in newSections) {
            if (!previousCourses[course] || !previousCourses[course].sections[section]) {
                events.push({type: "section_added", course, title: newCourses[course].name, section});
                emitSectionEvents(events, course, newCourses[course].name, section, {}, newSections[section]);
            }
        }
    }

    for (const course in previousCourses) {
        if (!newCourses[course]) {
            events.push({type: "course_removed", course, title: previousCourses[course].name});
            continue;
        }

        const previousCourse = previousCourses[course];
        const newCourse = newCourses[course];

        const title = newCourse.name;

        emitCourseEvents(events, course, title, previousCourse, newCourse);

        const previousSections = previousCourses[course].sections;
        const newSections = newCourses[course].sections;

        for (const section in previousSections) {
            if (!newSections[section]) {
                events.push({type: "section_removed", course, title, section});
                continue;
            }

            const previousSection = previousSections[section];
            const newSection = newSections[section];

            emitSectionEvents(events, course, title, section, previousSection, newSection);
        }
    }

    events.sort((a, b) => a.course!.localeCompare(b.course!));

    return events.map((e) => ({
        ...e,
        id: crypto.createHash("sha1").update(e.course! + e.type + timestamp + e.section + semester).digest("hex"),
        timestamp: timestamp,
        semester
    }));
};

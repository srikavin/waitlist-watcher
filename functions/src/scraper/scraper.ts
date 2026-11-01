import axios from "axios";
import type {CheerioAPI} from "cheerio";
const {load} = require("cheerio/slim") as Pick<typeof import("cheerio"), "load">;

import {measure} from "../telemetry";
import * as http from "http";
import * as https from "https";

const COURSE_LIST_URL = (semester: string, prefix: string) => `https://app.testudo.umd.edu/soc/${semester}/${prefix}`;
const SECTIONS_URL = (semester: string, prefix: string, courseList: string) => `https://app.testudo.umd.edu/soc/${semester}/sections?courseIds=${courseList}`;

const httpAgent = new http.Agent({keepAlive: true});
const httpsAgent = new https.Agent({keepAlive: true});

const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
    timeout: 30000,
});


export interface ScrapedMeeting {
    days?: string,
    start?: string,
    end?: string,
    meetingType?: string,
    location: {
        buildingCode?: string,
        classRoom?: string,
        sectionText?: string,
        elmsClassMessage?: string,
    }
}

export interface ScrapedSection {
    section: string,
    openSeats: number,
    totalSeats: number,
    instructor: string,
    waitlist: number,
    holdfile: number
    meetings: ScrapedMeeting[]
}

export interface ScrapedCourse {
    course: string,
    name: string,
    description: string,
    sections: Record<string, ScrapedSection>
}

export type ScrapedOutput = Record<string, ScrapedCourse>;

const getCourseList = async (semester: string, prefix: string) => {
    const data = (await measure("testudo.fetch_courses", () => axiosInstance.get(COURSE_LIST_URL(semester, prefix)))).data;

    return measure("testudo.parse_courses", () => {
        const $ = load(data);
        return Object.fromEntries($(".course").toArray().map((element, i) => {
            const course = $(element);
            let courseTitle = course.find(".course-title").first();
            if (!courseTitle.length) {
                courseTitle = course.parent().find(".course-title").eq(i);
            }
            const description = course.find(".approved-course-texts-container").first();
            return [course.attr("id")!, {
                name: courseTitle.text() || "<unknown>",
                description: description.length
                    ? description.text().trim().replace(/\t/g, "").replace(/\n\s*\n/g, '\n')
                    : "<none>"
            }];
        }));
    });
}

const parseNumber = (val: string) => {
    val = val.trim();

    const isNumber = /^\d+$/.test(val);

    if (!isNumber) {
        throw `'${val}' is not a valid number!`;
    }

    return Number(val);
}

const getMeetingTimes = (section: ReturnType<CheerioAPI>, $: CheerioAPI): ScrapedMeeting[] => {
    return section.find(".class-days-container > .row").toArray().map(element => {
        const meeting = $(element);
        const optionalText = (selector: string, key: string) => {
            const field = meeting.find(selector).first();
            return field.length ? {[key]: field.text()} : {};
        };
        return {
            ...optionalText(".section-days", "days"),
            ...optionalText(".class-start-time", "start"),
            ...optionalText(".class-end-time", "end"),
            location: {
                ...optionalText(".building-code", "buildingCode"),
                ...optionalText(".class-room", "classRoom"),
                ...optionalText(".section-text", "sectionText"),
                ...optionalText(".elms-class-message", "elmsClassMessage"),
            },
            ...optionalText(".class-type", "type")
        };
    });
}

export const getSectionInformation = async (semester: string, prefix: string): Promise<ScrapedOutput> => {
    const courseData = await getCourseList(semester, prefix);
    const courseList = Object.keys(courseData).join(",");
    const data = (await measure("testudo.fetch_sections", () => axiosInstance.get(SECTIONS_URL(semester, prefix, courseList)))).data;

    return measure("testudo.parse_sections", () => {
        const $ = load(data);
        return Object.fromEntries($(".course-sections").toArray().map(element => {
            const course = $(element);
            const courseId = course.attr("id")!;
            return [courseId, {
                course: courseId,
                name: courseData[courseId]?.name ?? "<unknown>",
                description: courseData[courseId]?.description ?? "<none>",
                sections: Object.fromEntries(course.find(".section").toArray().map(element => {
                    const section = $(element);
                    const waitlistField = section.find(".waitlist-count");
                    const holdfile = waitlistField.length === 2 ? parseNumber(waitlistField.eq(1).text()) : 0;
                    const sectionName = section.find(".section-id").first().text().trim();
                    return [sectionName, {
                        section: sectionName,
                        meetings: getMeetingTimes(section, $),
                        openSeats: parseNumber(section.find(".open-seats-count").first().text()),
                        totalSeats: parseNumber(section.find(".total-seats-count").first().text()),
                        instructor: section.find(".section-instructor").toArray().map(e => $(e).text()).sort().join(', '),
                        waitlist: waitlistField.length > 0 ? parseNumber(waitlistField.first().text()) : 0,
                        holdfile: holdfile
                    }];
                }))
            }];
        }));
    });
}

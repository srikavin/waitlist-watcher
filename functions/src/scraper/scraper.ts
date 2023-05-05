import axios from "axios";
import {JSDOM} from "jsdom";

import {fsdb} from "../common";
import * as http from "http";
import * as https from "https";

const COURSE_LIST_URL = (semester: string, prefix: string) => `https://app.testudo.umd.edu/soc/${semester}/${prefix}`;
const SECTIONS_URL = (semester: string, prefix: string, courseList: string) => `https://app.testudo.umd.edu/soc/${semester}/sections?courseIds=${courseList}`;

const httpAgent = new http.Agent({keepAlive: true});
const httpsAgent = new https.Agent({keepAlive: true});

const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
});

fsdb.settings({ignoreUndefinedProperties: true})

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
    const data = (await axiosInstance.get(COURSE_LIST_URL(semester, prefix))).data;

    // @ts-ignore
    return Object.fromEntries([...(new JSDOM(data)).window.document.querySelectorAll(".course")]
        .map((e, i) => {
            let courseTitle = e.querySelector(".course-title");
            if (!courseTitle) {
                // workaround for some course pages
                courseTitle = e.parentNode!.querySelectorAll(`.course-title`)[i]
            }
            return [
                e.id, {
                    name: (courseTitle && courseTitle.textContent) ? courseTitle.textContent : "<unknown>",
                    description: e.querySelector(".approved-course-texts-container")?.textContent!.trim()
                        .replace(/\t/g, "").replace(/\n\s*\n/g, '\n') ?? "<none>"
                }
            ]
        }));
}

const parseNumber = (val: string) => {
    val = val.trim();

    const isNumber = /^\d+$/.test(val);

    if (!isNumber) {
        throw `'${val}' is not a valid number!`;
    }

    return Number(val);
}

export const getMeetingTimes = (sectionNode: Element): ScrapedMeeting[] => {
    // @ts-ignore
    return [...sectionNode.querySelectorAll(".class-days-container > .row")].map(meeting => {
        let meetingType = meeting.querySelector(".class-type");
        let buildingCode = meeting.querySelector('.building-code');
        let classRoom = meeting.querySelector('.class-room');
        let sectionText = meeting.querySelector('.section-text');
        let days = meeting.querySelector('.section-days');
        let start = meeting.querySelector('.class-start-time');
        let end = meeting.querySelector('.class-end-time');
        let elmsClassMessage = meeting.querySelector('.elms-class-message');

        return {
            ...(days ? {days: days.textContent} : {}),
            ...(start ? {start: start.textContent} : {}),
            ...(end ? {end: end.textContent} : {}),
            location: {
                ...(buildingCode ? {buildingCode: buildingCode.textContent} : {}),
                ...(classRoom ? {classRoom: classRoom.textContent} : {}),
                ...(sectionText ? {sectionText: sectionText.textContent} : {}),
                ...(elmsClassMessage ? {elmsClassMessage: elmsClassMessage.textContent} : {}),
            },
            ...(meetingType ? {type: meetingType.textContent} : {})
        } as ScrapedMeeting;
    });
}

export const getSectionInformation = async (semester: string, prefix: string): Promise<ScrapedOutput> => {
    const courseData = await getCourseList(semester, prefix);
    const courseList = Object.keys(courseData).join(",");
    const data = (await axiosInstance.get(SECTIONS_URL(semester, prefix, courseList))).data;

    // @ts-ignore
    return Object.fromEntries([...(new JSDOM(data)).window.document.querySelectorAll(".course-sections")]
        .map(course => {
            return [course.id, {
                course: course.id,
                name: courseData[course.id] ? courseData[course.id].name : "<unknown>",
                description: courseData[course.id] ? courseData[course.id].description : "<none>",
                sections: Object.fromEntries([...course.querySelectorAll(".section")].map(section => {
                    const waitlistField = [...section.querySelectorAll(".waitlist-count")];
                    let holdfile = waitlistField.length === 2 ? parseNumber(waitlistField[1].textContent!) : 0;
                    let sectionName = section.querySelector(".section-id")!.textContent!.trim();
                    return [sectionName, {
                        section: sectionName,
                        meetings: getMeetingTimes(section),
                        openSeats: parseNumber(section.querySelector(".open-seats-count")!.textContent!),
                        totalSeats: parseNumber(section.querySelector(".total-seats-count")!.textContent!),
                        instructor: [...section.querySelectorAll(".section-instructor")].map(e => e.textContent).sort().join(', '),
                        waitlist: parseNumber(waitlistField[0].textContent!),
                        holdfile: holdfile
                    }];
                }))
            }]
        }));
}

const {getFirestore} = require('firebase-admin/firestore');
const axios = require("axios");
const HTMLParser = require('node-html-parser');
const {compare} = require("fast-json-patch");

const SEMESTER_CODE = "202208";
const COURSE_LIST_URL = (prefix) => `https://app.testudo.umd.edu/soc/${SEMESTER_CODE}/${prefix}`;
const SECTIONS_URL = (prefix, courseList) => `https://app.testudo.umd.edu/soc/${SEMESTER_CODE}/sections?courseIds=${courseList}`;

const db = getFirestore();

const getCourseList = async (prefix) => {
    const data = (await axios.get(COURSE_LIST_URL(prefix))).data;

    return HTMLParser.parse(data).querySelectorAll(".course").map((e) => e.id).join(",");
}

const getWaitlisted = async (prefix) => {
    const courseList = await getCourseList(prefix);
    const data = (await axios.get(SECTIONS_URL(prefix, courseList))).data;

    return HTMLParser.parse(data)
        .querySelectorAll(".course-sections")
        .map(course => {
            return {
                course: course.id,
                sections: course.querySelectorAll(".section").map(section => {
                    const waitlistField = section.querySelectorAll(".waitlist-count");
                    let holdfile = waitlistField.length === 2 ? Number(waitlistField[1].textContent) : 0;
                    return {
                        section: section.querySelector(".section-id").textContent.trim(),
                        openSeats: Number(section.querySelector(".open-seats-count").textContent),
                        totalSeats: Number(section.querySelector(".total-seats-count").textContent),
                        instructor: section.querySelector(".section-instructor").textContent,
                        waitlist: Number(waitlistField[0].textContent),
                        holdfile: holdfile
                    };
                })
            }
        });
}

exports.scraper = async (message, context) => {
    const prefix = Buffer.from(message.data, 'base64').toString();

    const data = await getWaitlisted(prefix);

    await db.runTransaction(async t => {
        const docRef = db.collection("course_data").doc(prefix)
        const diffRef = docRef.collection("historical").doc(context.timestamp);

        const currentDoc = await docRef.get();

        let previous = {
            latest: [],
            timestamp: -1,
            lastRun: -1,
            updateCount: 0
        };
        if (currentDoc.exists) {
            previous = currentDoc.data();
        }

        const diff = compare(previous.latest, data, true);
        const newUpdateCount = previous.updateCount + 1;

        if (diff.length !== 0) {
            t.set(docRef, {
                latest: data,
                timestamp: context.timestamp,
                lastRun: context.timestamp,
                updateCount: newUpdateCount
            });

            if (newUpdateCount % 15 === 0 || previous.timestamp === -1) {
                t.set(diffRef, {
                    type: "full",
                    contents: data,
                    basedOn: previous.timestamp
                })
            } else {
                t.set(diffRef, {
                    type: "diff",
                    diff: diff,
                    basedOn: previous.timestamp
                });
            }
        } else {
            t.update(docRef, {
                lastRun: context.timestamp
            });
        }
    });
}

const {getFirestore} = require('firebase-admin/firestore');
const axios = require("axios");
const HTMLParser = require('node-html-parser');
const {compare} = require("fast-json-patch");
const {PubSub} = require("@google-cloud/pubsub");

const SEMESTER_CODE = "202208";
const COURSE_LIST_URL = (prefix) => `https://app.testudo.umd.edu/soc/${SEMESTER_CODE}/${prefix}`;
const SECTIONS_URL = (prefix, courseList) => `https://app.testudo.umd.edu/soc/${SEMESTER_CODE}/sections?courseIds=${courseList}`;

const db = getFirestore();
const pubsub = new PubSub({projectId: "waitlist-watcher"});

const getCourseList = async (prefix) => {
    const data = (await axios.get(COURSE_LIST_URL(prefix))).data;

    return HTMLParser.parse(data).querySelectorAll(".course").map((e) => e.id).join(",");
}

const parseNumber = (val) => {
    val = val.trim();

    const isNumber = /^\d+$/.test(val);

    if (!isNumber) {
        throw `'${val}' is not a valid number!`;
    }

    return Number(val);
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
                    let holdfile = waitlistField.length === 2 ? parseNumber(waitlistField[1].textContent) : 0;
                    return {
                        section: section.querySelector(".section-id").textContent.trim(),
                        openSeats: parseNumber(section.querySelector(".open-seats-count").textContent),
                        totalSeats: parseNumber(section.querySelector(".total-seats-count").textContent),
                        instructor: section.querySelector(".section-instructor").textContent,
                        waitlist: parseNumber(waitlistField[0].textContent),
                        holdfile: holdfile
                    };
                })
            }
        });
}

exports.scraper = async (message, context) => {
    let prefixes;
    try {
        prefixes = JSON.parse(Buffer.from(message.data, 'base64').toString());
    } catch (e) {
        console.log("Got invalid JSON: ", Buffer.from(message.data, 'base64').toString());
        return;
    }

    const updateTopic = pubsub.topic("prefix-update");

    await Promise.all(prefixes.map(async (prefix) => {
        const data = await getWaitlisted(prefix);

        const updates = [];

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

            console.log("scraped ", prefix, " and found ", data.length, " courses with ", diff.length, " changes");

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

                const messageBuffer = Buffer.from(JSON.stringify({
                    prefix: prefix,
                    previousState: previous.latest,
                    newState: data,
                    diff: diff
                }), 'utf8');

                updates.push(messageBuffer);
            } else {
                t.update(docRef, {
                    lastRun: context.timestamp
                });
            }
        });

        await Promise.all(updates.map((e) => updateTopic.publish(e)));
    }));
}

import * as config from "../config.json";
import {fsdb} from "../common";
import {scraper} from "./scraper";

import type {CloudEvent} from "firebase-functions/v2";
import type {MessagePublishedData} from "firebase-functions/v2/pubsub";

const BATCH_SIZE = 8;

export const scraperLauncher = async (event: CloudEvent<MessagePublishedData>) => {
    console.log("Scraper triggered");
    const triggerDataRef = fsdb.collection("trigger_data").doc("state");

    let state: any = {
        prefixIndex: 0
    };
    const currentStateDoc = await triggerDataRef.get();
    if (currentStateDoc.exists) {
        state = currentStateDoc.data();
    }

    console.log("Scraping batch of size ", BATCH_SIZE, " at index ", state.prefixIndex);

    const prefixPromises = [];
    for (let semester of config.semesters) {
        for (let i = 0; i < BATCH_SIZE; ++i) {
            const prefix = config.prefixes[(state.prefixIndex + i) % config.prefixes.length];
            prefixPromises.push(scraper(semester, prefix, event.time, event.id))
            console.log("Started scraper for ", prefix);
        }
    }

    state.prefixIndex = state.prefixIndex + BATCH_SIZE;
    await triggerDataRef.set(state);

    console.log("Waiting for scraper completion");
    await Promise.all(prefixPromises);
    console.log("Scrapers finished");
}

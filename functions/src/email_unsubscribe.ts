import {rtdb} from "./common";
import {Request, Response} from "firebase-functions";

export const emailUnsubscribe = async (req: Request, res: Response) => {
    if (!req.query['id'] || !req.query['email'] || typeof req.query['id'] !== "string" || typeof req.query['email'] !== "string") {
        res.send("Invalid request");
        return;
    }

    const emailKey = rtdb.ref('user_settings').child(req.query['id']).child('email');
    if ((await emailKey.get()).val() === req.query['email']) {
        console.log("Unsubscribed user with id: ", req.query['id']);
        await emailKey.set("");
        res.send("Unsubscribed from future notifications.");
        return;
    }
    res.send("Could not locate a matching email subscription.");
}

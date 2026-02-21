import {initializeApp} from 'firebase-admin/app';
import fastify from "fastify";
import cors from '@fastify/cors'

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

import {discordRoute} from "./routes/discord";
import {authRoute} from "./routes/auth";
import {rawDataRoute} from "./routes/rawdata";

const PORT = Number(process.env.PORT) || 8080;

const app = fastify({
    logger: true
})

app.get('/', (request, reply) => {
    reply.send({test: 'appengine'})
});

app.register(cors, {})

app.register(authRoute)
app.register(discordRoute)
app.register(rawDataRoute)

app.listen({port: PORT}, (err, address) => {
    if (err) throw err;
});

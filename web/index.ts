import {initializeApp} from 'firebase-admin/app';

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

import fastify from "fastify";
import {authRoute} from "./routes/auth";

const PORT = Number(process.env.PORT) || 8080;

const app = fastify({
    logger: true
})

app.get('/', (request, reply) => {
    reply.send({test: 'appengine'})
});

app.register(authRoute)

app.listen({port: PORT}, (err, address) => {
    if (err) throw err;
});

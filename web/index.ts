import {Datastore} from "@google-cloud/datastore";
import {applicationDefault, initializeApp} from 'firebase-admin/app';
import fastify from "fastify";
import {authRoute} from "./routes/auth";

const PORT = Number(process.env.PORT) || 8080;

initializeApp();

const datastore = new Datastore();

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

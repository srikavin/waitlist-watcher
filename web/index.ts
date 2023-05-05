import {initializeApp} from 'firebase-admin/app';
import fastify from "fastify";
import fastify_raw_body from "fastify-raw-body";
import cors from '@fastify/cors'

initializeApp({
    databaseURL: "https://waitlist-watcher-default-rtdb.firebaseio.com"
});

import {discordRoute} from "./routes/discord";
import {authRoute} from "./routes/auth";
import {rawDataRoute} from "./routes/rawdata";
import {paymentRoute} from "./routes/payment";

const PORT = Number(process.env.PORT) || 8080;

const app = fastify({
    logger: true
})

app.get('/', (request, reply) => {
    reply.send({test: 'appengine'})
});

app.register(fastify_raw_body, {
    field: 'rawBody', // change the default request.rawBody property name
    global: false, // add the rawBody to every request. **Default true**
    encoding: 'utf8', // set it to false to set rawBody as a Buffer **Default utf8**
    runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
    routes: [] // array of routes, **`global`** will be ignored, wildcard routes not supported
})

app.register(cors, {})

app.register(authRoute)
app.register(discordRoute)
app.register(rawDataRoute)
app.register(paymentRoute)

app.listen({port: PORT}, (err, address) => {
    if (err) throw err;
});

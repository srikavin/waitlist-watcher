const PORT = process.env.PORT || 8080;

const app = require("fastify")({
    logger: true
})

app.get('/', (request, reply) => {
    reply.send({test: 'appengine'})
});

app.listen({port: PORT}, (err, address) => {
    if (err) throw err;
});

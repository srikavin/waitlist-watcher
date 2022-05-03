import type {FastifyInstance, FastifyPluginOptions, FastifyRequest} from "fastify";
import {XMLParser} from 'fast-xml-parser';
import {getAuth} from "firebase-admin/auth";
import axios from "axios";
import {getDatabase, ServerValue} from "firebase-admin/database";

const parser = new XMLParser({
    ignoreAttributes: true
});

const REQUEST_ID_REGEX = /^[A-Za-z\d]{32}$/;

const realtime_db = getDatabase();

const CAS_SERVICE_VALIDATE_URL = "https://shib.idm.umd.edu/shibboleth-idp/profile/cas/serviceValidate";
const CAS_SERVICE_LOGIN_URL = (service: string) => "https://shib.idm.umd.edu/shibboleth-idp/profile/cas/login?service=" + service;

const getService = (req: FastifyRequest, request_id: string) => {
    return encodeURI(req.protocol + '://' + req.hostname + "/post_cas/" + request_id);
}

export const authRoute = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
    fastify.get<{ Querystring: { ticket: string }, Params: { request_id: string } }>("/post_cas/:request_id", async (request, reply) => {
        fastify.log.info("ticket", request.query.ticket);
        const {ticket} = request.query;
        const {request_id} = request.params;

        if (!REQUEST_ID_REGEX.test(request_id)) {
            return {error: "invalid request_id"};
        }

        const res = await axios.get(CAS_SERVICE_VALIDATE_URL, {
            params: {
                ticket: ticket,
                service: getService(request, request_id)
            }
        });

        const parsed = parser.parse(res.data);

        const authSuccess = parsed["cas:serviceResponse"]["cas:authenticationSuccess"];

        const ref = realtime_db.ref(`auth_requests/${request_id}/`);

        if (!authSuccess) {
            await ref.set({
                status: "failure",
                timestamp: ServerValue.TIMESTAMP,
            });
            return {
                status: "failure"
            };
        }

        const uid = authSuccess["cas:attributes"]["cas:uid"];

        const user = await getAuth()
            .getUserByEmail(`${uid}@umd.edu`)
            .catch(async (e) => {
                if (e.errorInfo.code === 'auth/user-not-found') {
                    const user = await getAuth().createUser({
                        email: `${uid}@umd.edu`,
                        emailVerified: true
                    });
                    fastify.log.info({user: user.uid, uid}, "User registered");
                    return user;
                }

                await ref.set({
                    status: "failure",
                    timestamp: ServerValue.TIMESTAMP,
                });

                throw e;
            });

        fastify.log.info({uid}, "User logged in");

        const token = await getAuth().createCustomToken(user.uid);

        await ref.set({
            status: "success",
            timestamp: ServerValue.TIMESTAMP,
            token: token,
            uid: uid
        });

        reply.type('text/html');

        return `Successfully authenticated as ${uid}. You can close this tab. <script>window.close()</script>`;
    });

    fastify.get<{ Querystring: { request_id: string } }>("/cas_init", async (request, reply) => {
        const {request_id} = request.query;

        if (!REQUEST_ID_REGEX.test(request_id)) {
            return {error: "invalid request_id"};
        }

        reply.redirect(CAS_SERVICE_LOGIN_URL(getService(request, request_id)))
    });
}
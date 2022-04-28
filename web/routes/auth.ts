import type {FastifyInstance, FastifyPluginOptions, FastifyRequest} from "fastify";
import {XMLParser} from 'fast-xml-parser';
import {getAuth} from "firebase-admin/auth";
import axios from "axios";

const parser = new XMLParser({
    ignoreAttributes: true
});

const CAS_SERVICE_VALIDATE_URL = "https://shib.idm.umd.edu/shibboleth-idp/profile/cas/serviceValidate";
const CAS_SERVICE_LOGIN_URL = (service: string) => "https://shib.idm.umd.edu/shibboleth-idp/profile/cas/login?service=" + service;

const getService = (req: FastifyRequest) => {
    return req.protocol + '://' + req.hostname + "/post_cas";
}

export const authRoute = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
    fastify.get<{ Querystring: { ticket: string } }>("/post_cas", async (request, reply) => {
        fastify.log.info("ticket", request.query.ticket);
        const {ticket} = request.query;

        const res = await axios.get(CAS_SERVICE_VALIDATE_URL, {params: {ticket: ticket, service: getService(request)}});

        const parsed = parser.parse(res.data);

        const authSuccess = parsed["cas:serviceResponse"]["cas:authenticationSuccess"];

        if (!authSuccess) {
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

                throw e;
            });

        fastify.log.info({uid}, "User logged in");

        const token = await getAuth().createCustomToken(user.uid);

        return {
            status: "success",
            authSuccess,
            uid,
            user,
            token
        };
    });

    fastify.get("/cas_init", async (request, reply) => {
        reply.redirect(CAS_SERVICE_LOGIN_URL(getService(request)))
    });

    fastify.post<{
        Body: {
            email: string,
            password: string
        }
    }>("/register", async (request, reply) => {
        const {email, password} = request.body;

        // const r = await getAuth()
        //     .
    });
}
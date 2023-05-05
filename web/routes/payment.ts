import {FastifyInstance, FastifyPluginOptions} from "fastify";
import Stripe from 'stripe';
import {getDatabase} from "firebase-admin/database";

const realtime_db = getDatabase();

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: '2022-11-15',
});

const endpointSecret = process.env.STRIPE_SIGNING_SECRET!;

export const paymentRoute = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
    fastify.post("/payment/webhook", {config: {rawBody: true}}, async (request, reply) => {
        const sig = request.headers['stripe-signature'];

        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(request.rawBody!, sig!, endpointSecret);
        } catch (err: any) {
            fastify.log.error(err);
            reply.status(400).send(`Webhook Error.`);
            return;
        }

        switch (event.type) {
            case 'checkout.session.completed':
                const paymentIntentSucceeded = event.data.object as Stripe.Checkout.Session;
                if (!paymentIntentSucceeded.client_reference_id) {
                    fastify.log.error("Payment without associated client_reference_id!");
                    break;
                }
                if (!paymentIntentSucceeded.metadata?.semester) {
                    fastify.log.error("Payment without associated semester!");
                    break;
                }

                const semester = paymentIntentSucceeded.metadata.semester;
                const user_id = paymentIntentSucceeded.client_reference_id;

                fastify.log.info(`Payment received for semester ${semester} client reference id: ${user_id}`);
                await realtime_db.ref(`user_settings/${user_id}/paid_plan/${semester}`).set("pro");
                break;
            default:
                fastify.log.warn(`Unhandled event type ${event.type}`);
        }

        reply.send();
    });
}

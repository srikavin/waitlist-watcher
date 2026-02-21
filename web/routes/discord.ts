import type {FastifyInstance, FastifyPluginOptions} from "fastify";
import {getDatabase} from "firebase-admin/database";
import {verifyKey} from "discord-interactions";
import {
    APIApplicationCommandInteractionDataSubcommandOption,
    APIInteraction,
    APIInteractionResponse,
    ApplicationCommandOptionType,
    ApplicationCommandType,
    InteractionResponseType,
    InteractionType,
    RESTPostAPIApplicationCommandsJSONBody
} from "discord-api-types/v10";
import axios from "axios";
import {
    APIChatInputApplicationCommandInteractionData
} from "discord-api-types/payloads/v10/_interactions/_applicationCommands/chatInput";
import {
    subscribeToCourse,
    subscribeToCourseSection,
    subscribeToDepartment,
    subscribeToEverything,
    updateDiscordNotificationSettings
} from "../controllers/subscriptions";
import {FieldPath, getFirestore} from "firebase-admin/firestore";

const realtime_db = getDatabase();
const firestore = getFirestore();
let cachedDiscordClientSecret: string | undefined;
const APPLICATION_ID = "973034033669894165";
const CLIENT_PUB_KEY = "3b6baac3bd23cfa27ce6d45652d0c0c93b1f61900fe1a0986f0323323cff4030";
const DEFAULT_SEMESTER_TTL_MS = 10 * 60 * 1000;
let cachedDefaultSemester: string | undefined;
let cachedDefaultSemesterAt = 0;

async function getDiscordClientSecret(): Promise<string> {
    if (cachedDiscordClientSecret) {
        return cachedDiscordClientSecret;
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (!projectId) {
        throw new Error("Missing GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT for Secret Manager access.");
    }

    const tokenResponse = await axios.get<{access_token: string}>(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        {headers: {"Metadata-Flavor": "Google"}},
    );
    const accessToken = tokenResponse.data.access_token;

    const secretResponse = await axios.get<{payload?: {data?: string}}>(
        `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/DISCORD_CLIENT_SECRET/versions/latest:access`,
        {headers: {Authorization: `Bearer ${accessToken}`}},
    );

    const encodedData = secretResponse.data.payload?.data;
    if (!encodedData) {
        throw new Error("DISCORD_CLIENT_SECRET payload is empty.");
    }
    const data = Buffer.from(encodedData, "base64").toString("utf8").trim();
    if (!data) {
        throw new Error("DISCORD_CLIENT_SECRET payload decoded empty.");
    }

    cachedDiscordClientSecret = data;
    return data;
}

async function resolveDefaultSemester(): Promise<string> {
    if (cachedDefaultSemester && Date.now() - cachedDefaultSemesterAt < DEFAULT_SEMESTER_TTL_MS) {
        return cachedDefaultSemester;
    }

    const docs = await firestore.collection("course_listing").listDocuments();
    const semesters = docs
        .map((doc) => doc.id)
        .filter((id) => /^\d{6}$/.test(id))
        .sort((a, b) => Number(b) - Number(a));

    if (semesters.length === 0) throw new Error("No semester found in course_listing.");

    const latestSemester = semesters[0];
    cachedDefaultSemester = latestSemester;
    cachedDefaultSemesterAt = Date.now();
    return latestSemester;
}

const registerCommands = async () => {
    const clientSecret = await getDiscordClientSecret();
    const endpoint = `https://discord.com/api/v8/applications/${APPLICATION_ID}/commands`

    const payload: RESTPostAPIApplicationCommandsJSONBody = {
        "name": "coursewatcher",
        "type": ApplicationCommandType.ChatInput,
        "description": "Subscribe to course updates",
        "options": [
            {
                "name": "course",
                "description": "Subscribe to updates to a specific course",
                "type": ApplicationCommandOptionType.Subcommand,
                "options": [
                    {
                        "name": "course",
                        "description": "Course Code (MATH120)",
                        "type": ApplicationCommandOptionType.String,
                        "required": true
                    },
                    {
                        "name": "section",
                        "description": "Section Number (0101)",
                        "type": ApplicationCommandOptionType.String,
                    }
                ]
            },
            {
                "name": "department",
                "description": "Subscribe to updates to a specific department",
                "type": ApplicationCommandOptionType.Subcommand,
                "options": [
                    {
                        "name": "department",
                        "description": "Department prefix (MATH)",
                        "type": ApplicationCommandOptionType.String,
                        "required": true
                    }
                ]
            },
            {
                "name": "everything",
                "description": "Subscribe to all course updates",
                "type": ApplicationCommandOptionType.Subcommand,
            },
            {
                "name": "list",
                "description": "List subscriptions",
                "type": ApplicationCommandOptionType.Subcommand,
            }
        ]
    };

    return axios.post(endpoint, payload, {
        headers: {
            "Authorization": `Bot ${clientSecret}`
        }
    });
}

export const discordRoute = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
    await registerCommands();

    fastify.post<{ Body: APIInteraction }>("/discord/webhook", {config: {rawBody: true}}, async (request, reply)
        : Promise<{ error: true, reason: string } | APIInteractionResponse> => {
        const signature = request.headers['x-signature-ed25519'];
        const timestamp = request.headers['x-signature-timestamp'];

        // @ts-ignore
        const isValidRequest = verifyKey(request.rawBody, signature!, timestamp, CLIENT_PUB_KEY);
        if (!isValidRequest && request.hostname !== 'localhost:8080') {
            reply.status(401);
            return {error: true, reason: 'Bad request signature'};
        }
        request.raw

        const interaction = request.body;
        if (interaction.type === InteractionType.Ping) {
            return {
                type: InteractionResponseType.Pong
            };
        } else if (interaction.type === InteractionType.ApplicationCommand) {
            const interactionData = interaction.data as APIChatInputApplicationCommandInteractionData;
            let discordUserId = `${interaction.guild_id}@${interaction.channel_id}@guild@discord`;
            if (interaction.user) {
                discordUserId = `${interaction.user.id}@user@DM@discord`;
            }

            if (interactionData.options![0].name === "list") {
                const semester = await resolveDefaultSemester();
                const subscriptions = await realtime_db.ref(`user_settings/${discordUserId}/subscriptions/${semester}`).get();

                let subscriptionText = `No subscriptions for ${semester}.`;

                if (subscriptions.exists()) {
                    subscriptionText = `Subscriptions (${semester}): ` + Object.keys(subscriptions.val()).join(", ");
                }

                return {
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        embeds: [
                            {
                                title: "Current Subscriptions",
                                description: subscriptionText
                            }
                        ]
                    }
                };
            }

            await updateDiscordNotificationSettings(discordUserId, interaction.channel_id);
            const semester = await resolveDefaultSemester();

            let response = "";
            if (interactionData.options![0].name === "everything") {
                await subscribeToEverything(discordUserId, semester);

                response = "everything";
            } else if (interactionData.options![0].name === "course") {
                const subInteractionData = interactionData.options![0] as APIApplicationCommandInteractionDataSubcommandOption

                const course = subInteractionData.options![0].value as string;
                const section = subInteractionData.options?.[1]?.value as string | undefined;

                const prefixDoc = await firestore.collection("course_data").doc(course.substring(0, 4)).get();
                let name = "";
                if (prefixDoc.exists) {
                    const nameField = prefixDoc.get(new FieldPath("latest", course, "name"));
                    if (nameField) {
                        name = " - " + nameField;
                    }
                }

                if (section) {
                    await subscribeToCourseSection(discordUserId, semester, course, section);
                } else {
                    await subscribeToCourse(discordUserId, semester, course);
                }

                response = `${course}${name} (${section || "all sections"})`;
            } else if (interactionData.options![0].name === "department") {
                const subInteractionData = interactionData.options![0] as APIApplicationCommandInteractionDataSubcommandOption
                const department = subInteractionData.options![0].value as string;

                await subscribeToDepartment(discordUserId, semester, department);

                response = `${department}`;
            }

            return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    embeds: [
                        {
                            title: "Success",
                            description: `Subscribed to ${response}`
                        }
                    ]
                }
            }
        }

        return {error: true, reason: "unknown request type"};
    });
}

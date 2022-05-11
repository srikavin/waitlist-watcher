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
    subscribeToCourse, subscribeToCourseSection,
    subscribeToDepartment,
    subscribeToEverything,
    updateDiscordNotificationSettings
} from "../controllers/subscriptions";

const realtime_db = getDatabase();

const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const APPLICATION_ID = "973034033669894165";
const CLIENT_PUB_KEY = "3b6baac3bd23cfa27ce6d45652d0c0c93b1f61900fe1a0986f0323323cff4030";

const registerCommands = () => {
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
            "Authorization": `Bot ${CLIENT_SECRET}`
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
            const discordUserId = `${interaction.guild_id}@guild@discord`;

            if (interactionData.options![0].name === "list") {
                const subscriptions = await realtime_db.ref(`user_settings/${discordUserId}/subscriptions`).get();

                let subscriptionText = "No subscriptions.";

                if (subscriptions.exists()) {
                    subscriptionText = "Subscriptions: " + Object.keys(subscriptions.val()).join(", ");
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

            let response = "";
            if (interactionData.options![0].name === "everything") {
                await subscribeToEverything(discordUserId);

                response = "everything";
            } else if (interactionData.options![0].name === "course") {
                const subInteractionData = interactionData.options![0] as APIApplicationCommandInteractionDataSubcommandOption

                const course = subInteractionData.options![0].value;
                const section = subInteractionData.options?.[1]?.value as string | undefined;

                if (section) {
                    await subscribeToCourseSection(discordUserId, course as string, section);
                } else {
                    await subscribeToCourse(discordUserId, course as string);
                }


                response = `${course} (${section || "all sections"})`;
            } else if (interactionData.options![0].name === "department") {
                const subInteractionData = interactionData.options![0] as APIApplicationCommandInteractionDataSubcommandOption
                const department = subInteractionData.options![0].value as string;

                await subscribeToDepartment(discordUserId, department);

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
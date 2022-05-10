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

const realtime_db = getDatabase();

const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const APPLICATION_ID = "973034033669894165";
const CLIENT_PUB_KEY = "3b6baac3bd23cfa27ce6d45652d0c0c93b1f61900fe1a0986f0323323cff4030";

const registerCommands = () => {
    const endpoint = `https://discord.com/api/v8/applications/${APPLICATION_ID}/commands`

    const payload: RESTPostAPIApplicationCommandsJSONBody = {
        "name": "subscribe",
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

            const updates: Record<string, any> = {}

            updates[`user_settings/${discordUserId}/discord`] = `https://discord.com/api/v8/channels/${interaction.channel_id}/messages`;

            let response = "";

            if (interactionData.options![0].name === "everything") {
                const subscription = {
                    course_removed: true,
                    section_added: true,
                    instructor_changed: true,
                    open_seat_available: true,
                    section_removed: true,
                    waitlist_changed: true,
                    holdfile_changed: false,
                    open_seats_changed: false,
                    total_seats_changed: false
                }
                updates[`user_settings/${discordUserId}/subscriptions/everything`] = subscription;
                updates[`everything_subscriptions/${discordUserId}`] = subscription;

                response = "everything";
            }
            if (interactionData.options![0].name === "course") {
                const courseSubscriptionDefaults = {
                    course_removed: true,
                    section_added: true,
                    instructor_changed: true,
                    open_seat_available: true,
                    section_removed: true,
                    waitlist_changed: true,
                    holdfile_changed: false,
                    open_seats_changed: true,
                    total_seats_changed: true
                };

                const sectionSubscriptionDefaults = {
                    instructor_changed: true,
                    open_seat_available: true,
                    section_removed: true,
                    waitlist_changed: true,
                    holdfile_changed: false,
                    open_seats_changed: false,
                    total_seats_changed: false
                };

                const subInteractionData = interactionData.options![0] as APIApplicationCommandInteractionDataSubcommandOption

                const course = subInteractionData.options![0].value;
                const section = subInteractionData.options?.[1]?.value;

                if (section) {
                    updates[`section_subscriptions/${course}/${section}/`] = sectionSubscriptionDefaults;
                    updates[`user_settings/${discordUserId}/subscriptions/${course}-${section}`] = sectionSubscriptionDefaults;
                    response = `${course} (${section})`;
                } else {
                    updates[`course_subscriptions/${course}/`] = courseSubscriptionDefaults;
                    updates[`user_settings/${discordUserId}/subscriptions/${course}`] = courseSubscriptionDefaults;
                    response = `${course} (all sections)`;
                }
            }

            const rootRef = realtime_db.ref("/");
            await rootRef.update(updates);

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
import {AuthContext} from "../../context/AuthContext";
import {useCallback, useContext, useEffect, useState} from "react";
import {
    Alert,
    Button,
    Card,
    EmptyState,
    FormField,
    FormFieldDescription,
    Heading,
    Link,
    Pane,
    SearchTemplateIcon,
    Text,
    TextInput,
    TextInputField
} from "evergreen-ui";
import {auth, realtime_db, testNotifyFunction} from "../../firebase";
import {get, onValue, ref, remove, set} from "firebase/database";
import {notifWorker} from "../../main";
import {WatchButton, WatchCourseButton} from "../../components/CourseListing/CourseListing";
import {useTitle} from "../../util/useTitle";
import {UserSubscriptionsContext} from "../../context/UserSubscriptions";

function EnableNotificationsButton() {
    const [isLoading, setIsLoading] = useState(false);
    const [isErrored, setIsErrored] = useState(false);
    const [subscriptionUrl, setSubscriptionUrl] = useState("");

    const {isAuthed, getUser} = useContext(AuthContext);

    const supportsWebPush = "Notification" in window;

    const webPushRef = ref(realtime_db, "user_settings/" + getUser()?.uid + "/web_push");

    useEffect(() => {
        get(webPushRef).then((snapshot) => {
            if (snapshot.exists()) {
                setSubscriptionUrl(snapshot.val().endpoint);
            }
        })
    })

    const enablePushNotifications = useCallback(() => {
        if (!supportsWebPush) return;

        setIsLoading(true);

        void async function () {
            await window.Notification.requestPermission();

            const worker = await notifWorker;

            const subscription = await worker.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: new Uint8Array([
                    4, 137, 80, 233, 3, 196, 13, 19, 122, 41, 99,
                    111, 176, 44, 253, 87, 219, 93, 242, 240, 234, 59,
                    244, 61, 102, 133, 23, 209, 208, 51, 28, 8, 70,
                    85, 106, 0, 62, 56, 238, 43, 217, 229, 136, 31,
                    170, 165, 247, 13, 250, 215, 6, 125, 253, 3, 127,
                    157, 250, 99, 105, 36, 247, 23, 88, 106, 176
                ])
            });

            console.log(subscription.toJSON());

            await set(webPushRef, subscription.toJSON());

            setSubscriptionUrl(subscription.endpoint);
        }().then(() => {
            setIsErrored(false);
        }).catch((e) => {
            console.error(e);
            setIsErrored(true);
        }).finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        if (!JSON.parse(localStorage.getItem("disabledNotifications") || "false")) {
            enablePushNotifications();
        }
    }, []);

    const disablePushNotifications = useCallback(() => {
        localStorage.setItem("disabledNotifications", JSON.stringify(true));
        setIsLoading(true);
        set(webPushRef, {})
            .then(() => {
                setIsErrored(false)
                setSubscriptionUrl('');
            })
            .catch((e) => {
                console.error(e)
                setIsErrored(true);
            })
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <>
            {isErrored || !supportsWebPush && (
                <Pane marginBottom={12}>
                    {isErrored && (
                        <Alert intent="danger">Failed to enable notifications</Alert>
                    )}
                    {!supportsWebPush && (
                        <Alert intent="danger">
                            <Pane marginTop={-4}>
                                <Text size={400}>
                                    Your browser doesn't support web push notifications
                                    (<Link href="https://caniuse.com/push-api" target="_blank">view supported
                                    browsers</Link>).
                                </Text>
                            </Pane>
                        </Alert>
                    )}
                </Pane>
            )}
            <div>
                {subscriptionUrl ? (
                    <Pane display="flex" gap={10} width="100%">
                        <Button isLoading={isLoading} onClick={disablePushNotifications}>
                            Disable notifications
                        </Button>
                        <TextInput width="100%" disabled value={subscriptionUrl}/>
                    </Pane>

                ) : (
                    <Button isLoading={isLoading || !isAuthed} onClick={enablePushNotifications}
                            disabled={!supportsWebPush}>
                        Enable notifications
                    </Button>
                )}
            </div>
        </>
    );
}

function CurrentSubscriptions() {
    const {userSubscriptions} = useContext(UserSubscriptionsContext);

    if (Object.keys(userSubscriptions).length === 0) {
        return (
            <EmptyState
                title="You have no subscriptions"
                icon={<SearchTemplateIcon/>}
                iconBgColor="#EDEFF5"
                description="Try watching a course to get notified about updates"
            />
        );
    }

    return (
        <Pane display="flex" flexDirection="column">
            {
                Object.entries(userSubscriptions).map(([k, v]) => (
                    <Pane key={k} display="flex" gap={10} marginY={5}>
                        <Text>{k}</Text>
                        {k.includes('-') ? (
                            <WatchButton courseName={k.split('-')[0]} sectionName={k.split('-')[1]} label={"Edit"}/>
                        ) : (
                            <WatchCourseButton courseName={k} label={"Edit"}/>
                        )}
                    </Pane>
                ))}
        </Pane>
    )
}

export function NotificationSettingsBody() {
    const {isAuthed, getUser} = useContext(AuthContext);

    const [discordUrl, setDiscordUrl] = useState('');
    const [email, setEmail] = useState('');
    const [webhookUrl, setWebhookUrl] = useState('');

    const [storedDiscordUrl, setStoredDiscordUrl] = useState('');
    const [storedWebhookUrl, setStoredWebhookUrl] = useState('');
    const [storedEmail, setStoredEmail] = useState('');

    const discordUrlRef = ref(realtime_db, "user_settings/" + getUser()?.uid + "/discord");
    const webhookUrlRef = ref(realtime_db, "user_settings/" + getUser()?.uid + "/web_hook");
    const emailRef = ref(realtime_db, "user_settings/" + getUser()?.uid + "/email");

    const [statusText, setStatusText] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const isModified = storedDiscordUrl !== discordUrl || storedWebhookUrl !== webhookUrl || email != storedEmail;

    const save = useCallback(() => {
        if (!isAuthed) return Promise.resolve();

        return (async () => {
            setIsLoading(true);
            try {
                await set(discordUrlRef, discordUrl);
                await set(webhookUrlRef, webhookUrl);
                await set(emailRef, email);
                setStatusText('Saved!');
            } catch (e) {
                console.error(e);
                setStatusText('Failed to save!');
            } finally {
                setIsLoading(false);
            }
            setTimeout(() => setStatusText(''), 5000);
        })();
    }, [isAuthed, discordUrl, webhookUrl, email])

    useEffect(() => {
        return onValue(discordUrlRef, e => {
            if (e.exists()) {
                setDiscordUrl(e.val());
                setStoredDiscordUrl(e.val());
            }
        });
    }, []);

    useEffect(() => {
        return onValue(webhookUrlRef, e => {
            if (e.exists()) {
                setWebhookUrl(e.val());
                setStoredWebhookUrl(e.val());
            }
        });
    }, []);

    useEffect(() => {
        return onValue(emailRef, e => {
           if (e.exists()) {
               setEmail(e.val());
               setStoredEmail(e.val());
           }
        });
    })

    const isDiscordUrlValid = discordUrl === "" || /^https:\/\/discord.com\/api\//.test(discordUrl);
    const isUrlValid = webhookUrl === "" || /^https?:\/\//.test(webhookUrl);
    const isEmailValid = email === "" || (email.includes("@") && email.includes("."));

    return (
        <>
            <Pane>
                <Pane marginY={20}>
                    <FormField
                        label="Web Push Notifications"
                        description="Receive notifications through your browser">
                        <Pane display="flex" flexDirection="column">
                            <EnableNotificationsButton/>
                        </Pane>
                    </FormField>
                </Pane>
                <TextInputField
                    label="Discord Webhook URL"
                    description={<FormFieldDescription>Receive notifications on a Discord server <a
                        href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks">(more
                        details)</a></FormFieldDescription>}
                    placeholder="https://discord.com/api/webhooks/<...>/<...>"
                    value={discordUrl}
                    isInvalid={!isDiscordUrlValid}
                    validationMessage={!isDiscordUrlValid ? "A discord webhook must start with https://discord.com/api/" : null}
                    onChange={(e: any) => setDiscordUrl(e.target.value)}
                />
                <TextInputField
                    label="Webhook URL"
                    description="Receive notifications at a custom Webhook URL"
                    placeholder="https://example.com/course_changed"
                    value={webhookUrl}
                    isInvalid={!isUrlValid}
                    validationMessage={!isUrlValid ? "A webhook url must start with http:// or https://" : null}
                    onChange={(e: any) => setWebhookUrl(e.target.value)}
                />
                <TextInputField
                    label="Email Notifications"
                    description="Receive email notifications"
                    placeholder={getUser()?.email ?? "Email"}
                    value={email}
                    isInvalid={!isEmailValid}
                    validationMessage={!isEmailValid ? "Enter a valid email" : null}
                    onChange={(e: any) => setEmail(e.target.value)}
                />
            </Pane>
            <Pane marginRight={12} display={"inline"}>
                <Button disabled={!isDiscordUrlValid || !isUrlValid} onClick={save} isLoading={isLoading}
                        appearance={isModified ? "primary" : "default"}>Save</Button>
            </Pane>
            <Button disabled={!isDiscordUrlValid || !isUrlValid} onClick={() => {
                setIsLoading(true);
                save().then(() => {
                    testNotifyFunction()
                        .then(() => setStatusText("Sent test notification!"))
                        .finally(() => setIsLoading(false));
                })
            }} appearance={isModified ? "primary" : "default"}>Save and Send Test Notification</Button>
            <Pane marginLeft={20} display="inline"><Text>{statusText}</Text></Pane>
        </>
    );
}

function NotificationSettings() {
    return (
        <>
            <Heading size={800}>Notification Settings</Heading>
            <Text>Course notifications will be sent to all configured channels below.</Text>

            <NotificationSettingsBody/>
        </>
    );
}

function DeleteAccount() {
    const {getUser} = useContext(AuthContext);
    const [isLoading, setIsLoading] = useState(false);

    const deleteAccount = () => {
        if (!confirm("Are you sure you want to delete your account?")) {
            return;
        }
        setIsLoading(true);
        (async () => {
            const userSettingsRef = ref(realtime_db, "user_settings/" + getUser()!.uid + "/");
            try {
                console.log(auth.currentUser)
                await remove(userSettingsRef);
                await auth.currentUser!.delete();
            } catch (e) {
                alert("Deletion failed. Try again after signing out and signing back in. Check console for more details.");
                console.error(e);
            }
        })();
    };

    return (
        <>
            <Heading size={800}>Delete Account</Heading>
            <Text>Permanently delete your account and all associated subscriptions.</Text>

            <Pane marginTop={10}>
                <Button isLoading={isLoading} intent="danger" onClick={deleteAccount}>Delete account</Button>
            </Pane>
        </>
    );
}

export function ProfileScreen() {
    const {isAuthed, getUser} = useContext(AuthContext);
    useTitle("User Settings");

    if (!isAuthed) {
        return <Text>Need to be logged in.</Text>;
    }

    return (
        <>
            <Heading size={900} marginBottom={15}>Settings</Heading>
            <Pane display="flex" gap={10} flexDirection="column" marginBottom={80}>
                <Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>
                    <Heading size={800}>Login Settings</Heading>

                    <Pane marginY={20}>
                        <TextInputField
                            label="Email"
                            disabled
                            description="Used only for login purposes"
                            value={getUser()?.email ?? ""}
                        />
                        <TextInputField
                            label="Password"
                            description="Change your password"
                            placeholder="*********"
                        />
                    </Pane>

                    <Button>Save</Button>
                </Card>

                <Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>
                    <NotificationSettings/>
                </Card>

                <Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>
                    <Heading size={800}>Your subscriptions</Heading>
                    <Text>Edit and delete your subscriptions. Removing all subscription categories will unsubscribe
                        you.</Text>

                    <Pane marginTop={10}>
                        <CurrentSubscriptions/>
                    </Pane>
                </Card>


                <Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>
                    <DeleteAccount/>
                </Card>
            </Pane>
        </>
    )
        ;
}
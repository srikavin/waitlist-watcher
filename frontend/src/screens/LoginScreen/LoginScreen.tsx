import {useCallback, useContext, useEffect, useState} from "react";
import {Alert, Button, Card, Heading, Pane, Tab, Tablist, Text, TextInputField} from "evergreen-ui";
import {auth, realtime_db} from "../../firebase";
import {LoginWithUMD} from "../../components/LoginWithUMD/LoginWithUMD";
import {createUserWithEmailAndPassword, signInWithEmailAndPassword} from "firebase/auth";
import {useNavigate} from "react-router-dom";
import {AuthContext} from "../../context/AuthContext";
import {useTitle} from "../../util/useTitle";
import {get, ref} from "firebase/database";


export function LoginScreen() {
    const [selected, setSelected] = useState("Login")
    const [tabs] = useState(['Login', 'Register'])

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const navigate = useNavigate();
    useTitle(`Login/Sign up`);

    const {isAuthed, getUser} = useContext(AuthContext);

    const loginCallback = useCallback(() => {
        setLoading(true);
        setError('');

        signInWithEmailAndPassword(auth, email, password)
            .then(() => {
                // do nothing
            })
            .catch((error) => {
                const errorMessage = error.message;
                console.error(error);
                setError(errorMessage);
            })
            .finally(() => setLoading(false));

    }, [setError, setLoading, email, password]);

    const registerCallback = useCallback(() => {
        setLoading(true);
        setError('');

        createUserWithEmailAndPassword(auth, email, password)
            .then(() => {
                // do nothing
            })
            .catch((error) => {
                const errorMessage = error.message;
                console.error(error);
                setError(errorMessage);
            })
            .finally(() => setLoading(false));
    }, [setError, setLoading, email, password]);


    useEffect(() => {
        (async () => {
            const subscriptions = await Promise.all([
                get(ref(realtime_db, "user_settings/" + getUser()?.uid + "/discord")),
                get(ref(realtime_db, "user_settings/" + getUser()?.uid + "/web_push")),
                get(ref(realtime_db, "user_settings/" + getUser()?.uid + "/web_hook"))
            ]);
            if (subscriptions.some(e => e.exists() && e.val() != "")) {
                navigate("/profile")
            } else {
                navigate("/onboarding");
            }
        })();
    })

    if (isAuthed) {
        return <>Logged in...</>;
    }

    return (
        <Pane margin={10}>
            <Tablist marginBottom={16} flexBasis={2000} marginRight={24}>
                {tabs.map((tab, index) => (
                    <Tab
                        key={tab}
                        id={tab}
                        onSelect={() => {
                            setError('');
                            setSelected(tabs[index])
                        }}
                        isSelected={tabs[index] === selected}
                        aria-controls={`panel-${tab}`}
                    >
                        {tab}
                    </Tab>
                ))}
            </Tablist>

            <Card border="1px solid #c1c4d6" paddingY={20} paddingX={15}>
                {error ? (
                    <Alert marginBottom={20} intent="danger"
                           title={`Failed to ${selected.toLowerCase()}:`}>{error}</Alert>
                ) : null}

                <Heading size={900}>{selected}</Heading>

                <Pane marginY={20}>
                    <TextInputField
                        label="Email"
                        placeholder="person@email.com"
                        value={email}
                        required
                        onChange={(e: any) => setEmail(e.target.value)}
                        type="email"
                    />
                    <TextInputField
                        label="Password"
                        placeholder="*********"
                        required
                        value={password}
                        onChange={(e: any) => setPassword(e.target.value)}
                        type="password"
                    />
                </Pane>

                <Pane display="flex" flexDirection="column" textAlign="center" gap={10}>
                    <Button isLoading={loading}
                            onClick={selected === "Login" ? loginCallback : registerCallback}>{selected}</Button>

                    <Text fontWeight="bold" size={500}>OR</Text>

                    <LoginWithUMD/>
                </Pane>
            </Card>
        </Pane>
    )
}
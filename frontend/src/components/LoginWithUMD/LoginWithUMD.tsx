import {auth, realtime_db} from "../../firebase";
import {onValue, ref, set} from "firebase/database";
import {signInWithCustomToken} from "firebase/auth";
import {useCallback, useContext, useEffect, useState} from "react";
import {AuthContext} from "../../context/AuthContext";
import {Button} from "evergreen-ui";


function startLoginListener(req_id: string, callback: (isAuthed: boolean) => void) {
    const req_ref = ref(realtime_db, 'auth_requests/' + req_id);

    return onValue(req_ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();

            const success = data.status === "success";
            if (success) {
                localStorage.setItem("customToken", data.token);
                signInWithCustomToken(auth, localStorage.getItem("customToken")!)
                    .then((e) => {
                        callback(true);
                        set(req_ref, {});
                    });
            }
        }
    });
}

export function LoginWithUMD() {
    const [reqId, setReqId] = useState(window.crypto.randomUUID().replace(/-/g, ""));
    const {auth, setAuth} = useContext(AuthContext);

    useEffect(() => {
        return startLoginListener(reqId, setAuth);
    });

    const startAuthFlow = useCallback(() => {
        window.open("https://waitlist-watcher.uk.r.appspot.com/cas_init?request_id=" + reqId, "Login", "popup");
    }, [reqId]);

    return (
        <Button onClick={startAuthFlow} appearance="primary">Login with UMD CAS</Button>
    );
}
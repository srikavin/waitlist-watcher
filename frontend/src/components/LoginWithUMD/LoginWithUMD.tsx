import {auth, realtime_db} from "../../firebase";
import {onValue, ref, set} from "firebase/database";
import {signInWithCustomToken} from "firebase/auth";
import {useCallback, useEffect, useState} from "react";
import {Button} from "evergreen-ui";
import {v4 as uuidv4} from 'uuid';


function startLoginListener(req_id: string) {
    const req_ref = ref(realtime_db, 'auth_requests/' + req_id);

    return onValue(req_ref, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();

            const success = data.status === "success";
            if (success) {
                localStorage.setItem("customToken", data.token);
                signInWithCustomToken(auth, localStorage.getItem("customToken")!)
                    .then(() => {
                        set(req_ref, {});
                    });
            }
        }
    });
}

export function LoginWithUMD() {
    const [reqId,] = useState(uuidv4().replace(/-/g, ""));

    useEffect(() => {
        return startLoginListener(reqId);
    }, [reqId]);

    const startAuthFlow = useCallback(() => {
        window.open("https://waitlist-watcher.uk.r.appspot.com/cas_init?request_id=" + reqId, "Login", "popup");
    }, [reqId]);

    return (
        <Button onClick={startAuthFlow} appearance="primary">Login with UMD CAS</Button>
    );
}

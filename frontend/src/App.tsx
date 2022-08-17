import {useEffect, useState} from 'react'
import './App.css'

import {auth} from "./firebase";
import type {User} from "firebase/auth";
import {signInWithCustomToken} from 'firebase/auth';
import {AuthContext} from './context/AuthContext';
import {Card} from 'evergreen-ui'
import {Navigation} from "./components/Navigation/Navigation";
import {BrowserRouter, Route, Routes, useParams} from "react-router-dom";
import {LandingPageScreen} from "./screens/LandingPageScreen/LandingPageScreen";
import {CourseListing} from "./components/CourseListing/CourseListing";
import {ProfileScreen} from "./screens/ProfileScreen/ProfileScreen";
import {HistoryScreen} from './screens/HistoryScreen/HistoryScreen';

function PrefixRenderer() {
    let {prefix} = useParams();

    return <CourseListing prefix={prefix!}/>
}

function HistoryRenderer() {
    let {name} = useParams();

    return <HistoryScreen name={name!}/>
}

function App() {
    const [user, setUser] = useState<User>();
    const [isAuthed, setAuthed] = useState(false);

    useEffect(() => {
        if (!localStorage.customToken) return;

        signInWithCustomToken(auth, localStorage.getItem("customToken")!)
            .then((e) => {
                setUser(e.user);
            })
            .catch(() => {
                // reauth
            });
    }, []);

    useEffect(() => {
        return auth.onAuthStateChanged(() => {
            if (!!auth.currentUser) {
                setUser(auth.currentUser!);
            } else {
                setUser(undefined);
            }
            setAuthed(!!auth.currentUser);
        });
    }, [setAuthed, setUser])

    const authCtx = {
        isAuthed: isAuthed,
        getUser: () => user as User,
        logout: () => {
            auth.signOut();
            localStorage.removeItem("customToken");
        }
    };

    return (
        <BrowserRouter>
            <AuthContext.Provider value={authCtx}>
                <Navigation/>
                <Card marginTop={32} overflow="auto" maxWidth={1000} marginRight="auto" marginLeft="auto"
                      justifyContent="center">
                    <Routes>
                        <Route path="/" element={<LandingPageScreen/>}/>
                        <Route path="/department/:prefix" element={<PrefixRenderer/>}/>
                        <Route path="/history/:name" element={<HistoryRenderer/>}/>
                        <Route path="/profile" element={<ProfileScreen/>}/>
                    </Routes>
                </Card>
            </AuthContext.Provider>
        </BrowserRouter>
    )
}

export default App

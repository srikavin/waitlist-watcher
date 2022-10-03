import {useEffect, useState} from 'react'
import './App.css'

import {auth, db} from "./firebase";
import type {User} from "firebase/auth";
import {signInWithCustomToken} from 'firebase/auth';
import {AuthContext} from './context/AuthContext';
import {SemesterContext} from "./context/SemesterContext";
import {Card} from 'evergreen-ui'
import {Navigation} from "./components/Navigation/Navigation";
import {BrowserRouter, Route, Routes, useParams} from "react-router-dom";
import {LandingPageScreen} from "./screens/LandingPageScreen/LandingPageScreen";
import {CourseListing} from "./components/CourseListing/CourseListing";
import {ProfileScreen} from "./screens/ProfileScreen/ProfileScreen";
import {HistoryScreen} from './screens/HistoryScreen/HistoryScreen';
import {LoginScreen} from "./screens/LoginScreen/LoginScreen";
import {DepartmentsScreen} from "./screens/DepartmentsScreen/DepartmentsScreen";
import {doc, getDocFromServer} from "firebase/firestore";
import {getDocFromCache} from "@firebase/firestore";

function PrefixRenderer() {
    let {prefix} = useParams();

    return <CourseListing prefix={prefix!}/>
}

function HistoryRenderer() {
    let {name} = useParams();

    return <HistoryScreen name={name!}/>
}

function PageRenderer() {
    return (
        <Card marginTop={32} overflow="auto" maxWidth={1000} marginRight="auto" marginLeft="auto"
              justifyContent="center">
            <Routes>
                <Route path="/department/:prefix" element={<PrefixRenderer/>}/>
                <Route path="/departments" element={<DepartmentsScreen/>}/>
                <Route path="/history/:name" element={<HistoryRenderer/>}/>
                <Route path="/profile" element={<ProfileScreen/>}/>
                <Route path="/login" element={<LoginScreen/>}/>
            </Routes>
        </Card>
    );
}

function App() {
    const [user, setUser] = useState<User>();
    const [semester, setSemester] = useState("202301");
    const [courseListing, setCourseListing] = useState([]);

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
        });
    }, [setUser]);

    useEffect(() => {
        const semesterDoc = doc(db, `course_listing/${semester}`);
        getDocFromCache(semesterDoc).catch(() => getDocFromServer(semesterDoc)).then((e) => {
            setCourseListing(e.get("courses"));
        });
    }, [semester])

    const authCtx = {
        isAuthed: !!auth.currentUser,
        getUser: () => user as User,
        logout: () => {
            auth.signOut();
            localStorage.removeItem("customToken");
        }
    };

    const semesterCtx = {
        semester: semester,
        semesters: {
            "202208": {
                name: "Fall 2022",
                suffix: ''
            },
            "202301": {
                name: "Spring 2023",
                suffix: "202301"
            }
        },
        setSemester: setSemester,
        courseListing
    }

    return (
        <BrowserRouter>
            <AuthContext.Provider value={authCtx}>
                <SemesterContext.Provider value={semesterCtx}>
                    <Navigation/>
                    <Routes>
                        <Route path="/" element={<LandingPageScreen/>}/>
                        <Route path="*" element={<PageRenderer/>}/>
                    </Routes>
                </SemesterContext.Provider>
            </AuthContext.Provider>
        </BrowserRouter>
    )
}

export default App

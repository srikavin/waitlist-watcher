import {useEffect, useState} from 'react'
import './App.css'

import {auth, db, realtime_db} from "./firebase";
import type {User} from "firebase/auth";
import {signInWithCustomToken} from 'firebase/auth';
import {AuthContext} from './context/AuthContext';
import {SemesterContext} from "./context/SemesterContext";
import {Card} from 'evergreen-ui'
import {Navigation} from "./components/Navigation/Navigation";
import {Route, Routes, useLocation, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {LandingPageScreen} from "./screens/LandingPageScreen/LandingPageScreen";
import {CourseListing} from "./components/CourseListing/CourseListing";
import {ProfileScreen} from "./screens/ProfileScreen/ProfileScreen";
import {HistoryScreen} from './screens/HistoryScreen/HistoryScreen';
import {LoginScreen} from "./screens/LoginScreen/LoginScreen";
import {DepartmentsScreen} from "./screens/DepartmentsScreen/DepartmentsScreen";
import {clearIndexedDbPersistence, doc, getDocFromServer} from "firebase/firestore";
import {getDocFromCache} from "@firebase/firestore";
import {useTitle} from "./util/useTitle";
import {onValue, ref} from "firebase/database";
import {UserSubscriptionsContext} from "./context/UserSubscriptions";
import {OnboardingScreen} from "./screens/OnboardingScreen/OnboardingScreen";

const semesters = {
    "202208": {
        name: "Fall 2022",
        suffix: ''
    },
    "202301": {
        name: "Spring 2023",
        suffix: "202301"
    },
    "202308": {
        name: "Fall 2023",
        suffix: '202308'
    }
};

function PrefixRenderer() {
    let {prefix} = useParams();
    useTitle(`${prefix} Courses`);

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
                <Route path="/onboarding" element={<OnboardingScreen/>}/>
            </Routes>
        </Card>
    );
}

function App() {
    const [user, setUser] = useState<User>();
    const [courseListing, setCourseListing] = useState([]);
    const location = useLocation();
    const navigate = useNavigate();
    let [searchParams, _] = useSearchParams({semester: "202308"});
    const [semester, setSemester] = useState(searchParams.get("semester")!);
    const [userSubscriptions, setUserSubscriptions] = useState({});

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
        if (!(semester in semesters)) {
            setSemester("202308");
            navigate(location.pathname + "?" + new URLSearchParams({semester: "202308"}), {replace: true});
        } else if (new URLSearchParams(location.search).get("semester") !== semester)
            navigate(location.pathname + "?" + new URLSearchParams({semester}), {replace: true});
    }, [semester, location])

    useEffect(() => {
        if (!(semester in semesters)) {
            return;
        }
        const semesterDoc = doc(db, `course_listing/${semester}`);
        getDocFromCache(semesterDoc).catch(() => getDocFromServer(semesterDoc)).then((e) => {
            const listing = e.get("courses");
            if (listing) {
                setCourseListing(listing);
            } else {
                clearIndexedDbPersistence(db).then(() => {
                    getDocFromCache(semesterDoc).then(e => setCourseListing(e.get("courses")));
                });
            }
        });
    }, [semester])

    useEffect(() => {
        if (!user) return;
        return onValue(ref(realtime_db, "user_settings/" + user!.uid + "/subscriptions"), e => {
            if (e.exists()) {
                setUserSubscriptions(e.val())
            } else {
                setUserSubscriptions({})
            }
        });
    }, [user]);

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
        semesters,
        setSemester: setSemester,
        courseListing
    }

    if (!(semester in semesters)) {
        return null;
    }

    return (
        <AuthContext.Provider value={authCtx}>
            <SemesterContext.Provider value={semesterCtx}>
                <UserSubscriptionsContext.Provider value={{userSubscriptions}}>
                    <Navigation/>
                    <Routes>
                        <Route path="/" element={<LandingPageScreen/>}/>
                        <Route path="*" element={<PageRenderer/>}/>
                    </Routes>
                </UserSubscriptionsContext.Provider>
            </SemesterContext.Provider>
        </AuthContext.Provider>
    )
}

export default App

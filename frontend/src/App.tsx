import {useEffect, useState} from 'react'
import './App.css'

import {auth, db, realtime_db} from "./firebase";
import type {User} from "firebase/auth";
import {signInWithCustomToken} from 'firebase/auth';
import {AuthContext} from './context/AuthContext';
import {SemesterContextProvider, SemesterInfo} from "./context/SemesterContext";
import {Card} from 'evergreen-ui'
import {Navigation} from "./components/Navigation/Navigation";
import {Route, Routes, useLocation, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {LandingPageScreen} from "./screens/LandingPageScreen/LandingPageScreen";
import {CourseListing} from "./components/CourseListing/CourseListing";
import {ProfileScreen} from "./screens/ProfileScreen/ProfileScreen";
import {HistoryScreen} from './screens/HistoryScreen/HistoryScreen';
import {LoginScreen} from "./screens/LoginScreen/LoginScreen";
import {DepartmentsScreen} from "./screens/DepartmentsScreen/DepartmentsScreen";
import {clearIndexedDbPersistence, collection, doc, getDocFromServer} from "firebase/firestore";
import {getDocFromCache} from "@firebase/firestore";
import {useTitle} from "./util/useTitle";
import {onValue, ref} from "firebase/database";
import {UserSubscriptionsContext} from "./context/UserSubscriptions";
import {OnboardingScreen} from "./screens/OnboardingScreen/OnboardingScreen";
import {FSCourseDataConverter, FSEventsConverter} from "@/common/firestore";
import {StatsScreen} from "./screens/StatsScreen/StatsScreen";

const semesters: Record<string, SemesterInfo> = {
    "202208": {
        name: "Fall 2022",
        id: "202208",
        courseDataCollection: collection(db, "course_data").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events").withConverter(FSEventsConverter)
    },
    "202301": {
        name: "Spring 2023",
        id: "202301",
        courseDataCollection: collection(db, "course_data202301").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202301").withConverter(FSEventsConverter)
    },
    "202308": {
        name: "Fall 2023",
        id: "202308",
        courseDataCollection: collection(db, "course_data202308").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202308").withConverter(FSEventsConverter)
    },
    "202401": {
        name: "Spring 2024",
        id: "202401",
        courseDataCollection: collection(db, "course_data202401").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202401").withConverter(FSEventsConverter)
    },
    "202408": {
        name: "Fall 2024",
        id: "202408",
        courseDataCollection: collection(db, "course_data202408").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202408").withConverter(FSEventsConverter)
    },
    "202501": {
        name: "Spring 2025",
        id: "202501",
        courseDataCollection: collection(db, "course_data202501").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202501").withConverter(FSEventsConverter)
    },
    "202508": {
        name: "Fall 2025",
        id: "202508",
        courseDataCollection: collection(db, "course_data202508").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202508").withConverter(FSEventsConverter)
    },
    "202601": {
        name: "Spring 2026",
        id: "202601",
        courseDataCollection: collection(db, "course_data202601").withConverter(FSCourseDataConverter),
        eventsCollection: collection(db, "events202601").withConverter(FSEventsConverter)
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
    let [searchParams, _] = useSearchParams({semester: "202601"});
    const [semester, setSemester] = useState(searchParams.get("semester")!);
    const [subscriptionsBySemester, setSubscriptionsBySemester] = useState<Record<string, Record<string, any>>>({});
    const [subscriptionMethods, setSubscriptionMethods] = useState<string[]>([]);

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

    const [isPro, setIsPro] = useState(false);

    useEffect(() => {
        if (!user) return;
        return onValue(ref(realtime_db, "user_settings/" + user!.uid), e => {
            const allSubs = (e.child("subscriptions").val() ?? {}) as Record<string, Record<string, any>>;
            setSubscriptionsBySemester(allSubs);
            setIsPro(e.child("paid_plan/" + semester).val() === "pro");
            setSubscriptionMethods([
                ...((e.child("email").val() ?? "") ? ["email"] : []),
                ...((e.child("web_hook").val() ?? "") ? ["web_hook"] : []),
                ...(e.child("web_push").exists() ? ["web_push"] : []),
                ...((e.child("discord").val() ?? "") ? ["discord"] : []),
            ]);
        });
    }, [user, semester]);

    const authCtx = {
        isAuthed: !!auth.currentUser,
        getUser: () => user as User,
        isPro: isPro,
        logout: () => {
            auth.signOut();
            localStorage.removeItem("customToken");
        }
    };

    const semesterCtx = {
        semester: semesters[semester],
        semesters,
        setSemester: setSemester,
        courseListing
    }

    if (!(semester in semesters)) {
        return null;
    }

    return (
        <AuthContext.Provider value={authCtx}>
            <SemesterContextProvider value={semesterCtx}>
                <UserSubscriptionsContext.Provider value={{subscriptionsBySemester, subscriptionMethods}}>
                    <Navigation/>
                    <Routes>
                        <Route path="/" element={<LandingPageScreen/>}/>
                        <Route path="/stats" element={<StatsScreen/>}/>
                        <Route path="*" element={<PageRenderer/>}/>
                    </Routes>
                </UserSubscriptionsContext.Provider>
            </SemesterContextProvider>
        </AuthContext.Provider>
    )
}

export default App

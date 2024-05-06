import {useMemo} from "react";
import {
    ChatIcon,
    CodeIcon,
    EnvelopeIcon,
    Icon,
    Link,
    MobilePhoneIcon,
    NotificationsIcon,
    TickCircleIcon
} from "evergreen-ui";
import {useTitle} from "../../util/useTitle";
import {HistoryScreen} from "../HistoryScreen/HistoryScreen";
import {NavLink} from "react-router-dom";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";

function NotificationInfo(props: { icon: any, title: string, description: string }) {
    return (
        <div className="w-full justify-center flex flex-col bg-white px-4 py-4 rounded-lg">
            <div className="text-center mt-4">
                <div className="flex gap-4 mx-4">
                    <div className="place-self-center relative inline">
                        <Icon icon={props.icon} size={28} color="info"/>
                    </div>
                    <h3 className="text-md font-bold">{props.title}</h3>
                </div>
                <p className="mt-2 text-sm text-gray-600">{props.description}</p>
            </div>
        </div>
    );
}

export function LandingPageScreen() {
    const {courseListing} = useSemesterContext();

    const randomCourseName = useMemo(() => {
        if (courseListing.length === 0) {
            return "EMPTY";
        }
        let filteredCourseListings = courseListing.filter(x => x.includes('-'));

        return filteredCourseListings[Math.floor(Math.random() * filteredCourseListings.length)];
    }, [courseListing])

    useTitle("Waitlist Watcher");

    return (
        <>
            <section className="relative z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="pt-16 pb-24 md:pt-16 md:pb-32">
                        <div className="text-center pb-12 md:pb-16">
                            <h1 className="text-5xl md:text-6xl font-extrabold leading-tighter tracking-tighter mb-4"
                                data-aos="zoom-y-out">Never miss an <span
                                className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-teal-400">open seat </span>
                                again.
                            </h1>
                            <div className="max-w-3xl mx-auto">
                                <p className="text-xl text-gray-600 mb-8" data-aos="zoom-y-out" data-aos-delay="150">
                                    Get notified of course and section removals, added sections, professor changes, seat
                                    availability, and view historical data.
                                </p>
                                <div className="max-w-xs mx-auto sm:max-w-none sm:flex sm:justify-center">
                                    <div>
                                        <NavLink to={"/login"}>
                                            <button
                                                className="btn text-white bg-blue-600 hover:bg-blue-700 w-full mb-4 sm:w-auto sm:mb-0">
                                                Get Started
                                            </button>
                                        </NavLink>
                                    </div>
                                    <div>
                                        <NavLink to={"/departments"}>
                                            <button
                                                className="btn text-white bg-gray-900 hover:bg-gray-800 w-full sm:w-auto sm:ml-4">
                                                View Departments
                                            </button>
                                        </NavLink>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="relative flex justify-center flex-col w-9/12 mx-auto">
                            <div className="bg-white">
                                <HistoryScreen name={randomCourseName} minimal landing={true}/>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="relative -mt-64">
                <div className="absolute inset-0 bg-gray-50 pointer-events-none" aria-hidden="true"></div>
                <div className="h-36"></div>

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-12">
                    <div className="pt-12">
                        <div className="flex md:flex-row flex-col gap-6 md:gap-0">
                            <div className="w-1/2 mr-8 place-self-center">

                                <div className="max-w-3xl mx-auto pb-3">
                                    <h1 className="h2 mb-4">Get notified how you want.</h1>
                                    <p className="text-xl text-left text-gray-600">Choose which events to receive
                                        real-time notifications for:</p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {["New Courses",
                                        "New Sections",
                                        "Removed Courses",
                                        "Removed Sections",
                                        "Course Name and Description Changes",
                                        "Section Meeting Time Changes",
                                        "Instructor Changes",
                                        "Seat Changes",
                                        "Waitlist and Holdfile Changes"].map(x =>
                                        (<span key={x} className="border-blue-500 px-2 border-2">
                                            {x}
                                        </span>)
                                    )}
                                </div>
                            </div>
                            <div className="md:w-8/12">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <NotificationInfo
                                        icon={<NotificationsIcon/>}
                                        title="Push Notifications"
                                        description="Get notified through your browser or phone using WebPush notifications."/>
                                    <NotificationInfo
                                        icon={<ChatIcon/>}
                                        title="Discord"
                                        description="Get course updates in Discord Servers or direct messages."/>
                                    <NotificationInfo
                                        icon={<CodeIcon/>}
                                        title="Web Hooks"
                                        description="Integrate with third-party apps using web hooks."/>
                                    <NotificationInfo
                                        icon={<MobilePhoneIcon/>}
                                        title="Text Message*"
                                        description="Get notified through real-time text message updates."/>
                                    <NotificationInfo
                                        icon={<EnvelopeIcon/>}
                                        title="Email*"
                                        description="Get notified through emails."/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="relative pt-12">
                <div
                    className="absolute inset-0 bg-gradient-to-b from-red-50 to-blue-50 pointer-events-none border-t-2 border-b-2 border-amber-500"
                    aria-hidden="true"></div>
                <div className="text-center relative max-w-6xl mx-auto px-4 sm:px-6 pb-12 gap-12">
                    <h2 className="h2 mb-4">Plans</h2>

                    <div className="flex justify-center gap-12">
                        <div className="w-64 p-4 bg-white shadow-lg rounded-2xl">
                            <p className="mb-4 text-xl font-medium text-gray-800">
                                Always Free
                            </p>
                            <p className="text-3xl font-bold text-gray-900">
                                $0
                                <span className="text-sm text-gray-300">/ semester</span>
                            </p>
                            <p className="mt-4 text-xs text-gray-600">
                                Core features will always be free.
                            </p>
                            <ul className="w-full mt-6 mb-6 text-sm text-gray-600">
                                {["No Watch Limit", "Real-time Notifications", "Push Notifications", "Discord Notifications", "Web Hook Notifications", "Email Notifications"].map(x => (
                                    <li className="mb-3 flex gap-2 items-center" key={x}>
                                        <Icon color="#10b981" size={24} icon={<TickCircleIcon/>}></Icon>
                                        {x}
                                    </li>
                                ))}
                            </ul>
                            <NavLink to={"/login"}>
                                <button type="button"
                                        className="py-2 px-4  bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 focus:ring-offset-indigo-200 text-white w-full transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2  rounded-lg ">
                                    Register
                                </button>
                            </NavLink>
                        </div>
                    </div>
                </div>
            </section>
            <section className="mt-12">
                <div className="text-center relative max-w-6xl mx-auto px-4 sm:px-6 pb-12">
                    <h1 className="h2 mb-4">Raw Data and Source Code</h1>
                    <p className="text-xl text-center text-gray-600 mb-4">
                        Want to use the raw data for your own purposes or see how Waitlist Watcher works?
                    </p>
                    <p>
                        Get the
                        <Link size={600} target="_blank"
                              href="https://waitlist-watcher.uk.r.appspot.com/raw/202301/CMSC/events"> raw event
                            data </Link>
                        and
                        <Link size={600} target="_blank"
                              href="https://waitlist-watcher.uk.r.appspot.com/raw/202301/CMSC/snapshots"> course history
                            snapshots</Link>.
                        This project is open source on
                        <Link size={600} href="https://github.com/srikavin/waitlist-watcher"> Github.</Link>
                    </p>
                </div>
            </section>
        </>
    );
}
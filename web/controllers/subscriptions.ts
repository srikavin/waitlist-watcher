import {getDatabase} from "firebase-admin/database";

const realtime_db = getDatabase();

type CategorySubscriptions = Partial<{
    course_removed: boolean;
    section_added: boolean,
    course_name_changed: boolean;
    section_removed: boolean;
    instructor_changed: boolean;
    total_seats_changed: boolean;
    open_seat_available: boolean;
    open_seats_changed: boolean;
    waitlist_changed: boolean;
    holdfile_changed: boolean;
}>

const courseSubscriptionDefaults: CategorySubscriptions = {
    course_removed: true,
    section_added: true,
    instructor_changed: true,
    open_seat_available: true,
    section_removed: true,
    waitlist_changed: true,
    holdfile_changed: true,
    open_seats_changed: true,
    total_seats_changed: true,
    course_name_changed: true,
};

const sectionSubscriptionDefaults: CategorySubscriptions = {
    instructor_changed: true,
    open_seat_available: true,
    open_seats_changed: true,
    total_seats_changed: true,
    section_removed: true,
    waitlist_changed: true,
    holdfile_changed: true,
};

const departmentSubscriptionDefaults: CategorySubscriptions = {
    course_removed: true,
    section_added: true,
    course_name_changed: true,
    section_removed: true,
    instructor_changed: true,
    total_seats_changed: true,
    open_seats_changed: true,
    open_seat_available: true,
    waitlist_changed: true,
    holdfile_changed: true,
};

const everythingSubscriptionDefaults: CategorySubscriptions = {
    course_removed: true,
    section_added: true,
    instructor_changed: true,
    open_seat_available: true,
    open_seats_changed: true,
    section_removed: true,
    course_name_changed: true,
    total_seats_changed: true,
};

export const updateDiscordNotificationSettings = async (userId: string, channelId: string) => {
    const updates: Record<string, any> = {};

    await realtime_db.ref(`user_settings/${userId}/discord`)
        .set(`https://discord.com/api/v8/channels/${channelId}/messages`);
}

export const subscribeToCourseSection = async (userId: string, courseName: string, section: string, channels: Record<string, boolean> = sectionSubscriptionDefaults) => {
    const updates: Record<string, any> = {}

    updates[`section_subscriptions/${courseName}/${section}/${userId}`] = channels;
    updates[`user_settings/${userId}/subscriptions/${courseName}-${section}`] = channels;

    await realtime_db.ref('/').update(updates);
}

export const subscribeToCourse = async (userId: string, courseName: string, channels: Record<string, boolean> = courseSubscriptionDefaults) => {
    const updates: Record<string, any> = {}

    updates[`course_subscriptions/${courseName}/${userId}`] = channels;
    updates[`user_settings/${userId}/subscriptions/${courseName}`] = channels;

    await realtime_db.ref('/').update(updates);
}

export const subscribeToEverything = async (userId: string, channels: Record<string, boolean> = everythingSubscriptionDefaults) => {
    const updates: Record<string, any> = {}

    updates[`everything_subscriptions/${userId}`] = channels;
    updates[`user_settings/${userId}/subscriptions/everything`] = channels;

    await realtime_db.ref('/').update(updates);
}

export const subscribeToDepartment = async (userId: string, department: string, channels: Record<string, boolean> = departmentSubscriptionDefaults) => {
    const updates: Record<string, any> = {}

    updates[`department_subscriptions/${userId}`] = channels;
    updates[`user_settings/${userId}/subscriptions/${department}`] = channels;

    await realtime_db.ref('/').update(updates);
}
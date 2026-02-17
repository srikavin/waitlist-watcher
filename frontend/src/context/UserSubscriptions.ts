import {createContext} from "react";

type UserSubscriptions = {
    subscriptionsBySemester: Record<string, Record<string, any>>
    subscriptionMethods: string[]
};

export const UserSubscriptionsContext = createContext<UserSubscriptions>({
    subscriptionsBySemester: {},
    subscriptionMethods: []
});

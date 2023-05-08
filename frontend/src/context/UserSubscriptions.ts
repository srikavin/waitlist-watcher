import {createContext} from "react";

type UserSubscriptions = {
    userSubscriptions: Record<string, any>
    subscriptionMethods: string[]
};

export const UserSubscriptionsContext = createContext<UserSubscriptions>({
    userSubscriptions: {},
    subscriptionMethods: []
});

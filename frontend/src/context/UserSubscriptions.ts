import {createContext} from "react";

type UserSubscriptions = {
    userSubscriptions: Record<string, any>
};

export const UserSubscriptionsContext = createContext<UserSubscriptions>({
    userSubscriptions: {}
});

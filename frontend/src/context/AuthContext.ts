import {createContext} from "react";
import {User} from "firebase/auth";

type AuthContextValue = {
    auth: true,
    setAuth: (authed: boolean) => void,
    getUser: () => User,
    logout: () => void
} | {
    auth: false,
    setAuth: (authed: boolean) => void,
    getUser: () => User | null,
    logout: () => void
};

export const AuthContext = createContext<AuthContextValue>({
    auth: false,
    setAuth: (authed: boolean) => {
    },
    getUser: () => null,
    logout: () => undefined
});
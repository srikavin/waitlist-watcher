import {createContext} from "react";
import {User} from "firebase/auth";

type AuthContextValue = {
    isAuthed: true,
    isPro: boolean,
    getUser: () => User,
    logout: () => void
} | {
    isAuthed: false,
    isPro: boolean,
    getUser: () => User | null,
    logout: () => void
};

export const AuthContext = createContext<AuthContextValue>({
    isAuthed: false,
    isPro: false,
    getUser: () => null,
    logout: () => undefined
});
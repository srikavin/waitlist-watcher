import {createContext} from "react";
import {User} from "firebase/auth";

type AuthContextValue = {
    isAuthed: true,
    getUser: () => User,
    logout: () => void
} | {
    isAuthed: false,
    getUser: () => User | null,
    logout: () => void
};

export const AuthContext = createContext<AuthContextValue>({
    isAuthed: false,
    getUser: () => null,
    logout: () => undefined
});
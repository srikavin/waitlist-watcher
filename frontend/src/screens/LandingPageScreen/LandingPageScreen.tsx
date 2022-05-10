import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {Heading, Text} from "evergreen-ui";
import {CoursePrefixListing} from "../../components/CoursePrefixListing/CoursePrefixListing";
import {LoginScreen} from "../LoginScreen/LoginScreen";

export function LandingPageScreen() {
    const {isAuthed} = useContext(AuthContext);

    if (!isAuthed) {
        return <LoginScreen/>
    }

    return (
        <>
            <Heading size={900} marginBottom={12}>Departments</Heading>
            <Text size={600} marginBottom={16}>Choose a department</Text>
            <CoursePrefixListing/>
        </>
    );
}
import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {LoginWithUMD} from "../../components/LoginWithUMD/LoginWithUMD";
import {Heading, Text} from "evergreen-ui";
import {CoursePrefixListing} from "../../components/CoursePrefixListing/CoursePrefixListing";

export function LandingPageScreen() {
    const {auth} = useContext(AuthContext);

    if (!auth) {
        return <LoginWithUMD/>
    }

    return (
        <>
            <Heading size={900} marginBottom={12}>Departments</Heading>
            <Text size={600} paddingBottom={8}>Choose a department</Text>
            <CoursePrefixListing/>
        </>
    );
}
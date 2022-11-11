import {Card, Heading, Pane} from "evergreen-ui";
import {NotificationSettingsBody} from "../ProfileScreen/ProfileScreen";
import {NavLink} from "react-router-dom";
import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {useTitle} from "../../util/useTitle";

export function OnboardingScreen() {
    useTitle("Setup Notifications");

    const {isAuthed} = useContext(AuthContext);

    if (!isAuthed) return null;

    return (
        <Pane margin={10}>
            <Heading size={900}>Setup Notifications</Heading>
            <Heading size={400}>Choose how you want to receive notifications. You can configure notifications at any time in the profile page.</Heading>

            <Card border="1px solid #c1c4d6" marginY={20} paddingBottom={20} paddingX={15}>
                <NotificationSettingsBody />
            </Card>

            <NavLink to={"/profile"}>Continue to profile</NavLink>
        </Pane>
    );
}
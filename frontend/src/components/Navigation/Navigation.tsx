import {Button, Heading, Pane} from "evergreen-ui";
import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {LoginWithUMD} from "../LoginWithUMD/LoginWithUMD";
import {useNavigate} from "react-router-dom";

export function Navigation() {
    const {isAuthed, getUser, logout} = useContext(AuthContext);
    const navigate = useNavigate();

    return (
        <Pane display="flex" padding={16} background="tint2" borderRadius={3}>
            <Pane flex={1} alignItems="center" flexBasis="bottom" display="flex">
                <Heading size={600}>Waitlist Watcher</Heading>

                <Button marginLeft={20} appearance="minimal" onClick={() => navigate("/")}>Departments</Button>
            </Pane>
            <Pane>
                {!isAuthed ? (
                    <LoginWithUMD/>
                ) : (
                    <>
                        <Button appearance="minimal" onClick={() => navigate("/profile")}>{getUser()!.email}</Button>
                        <Button marginRight={8} intent="danger" appearance="minimal" onClick={logout}>Logout</Button>
                    </>
                )}
            </Pane>
        </Pane>
    );
}

import {Button, Heading, Pane, Select} from "evergreen-ui";
import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {useNavigate} from "react-router-dom";
import {Search} from "../Search/Search";
import {SemesterContext} from "../../context/SemesterContext";
import styles from './Navigation.module.css'

export function Navigation() {
    const {isAuthed, getUser, logout} = useContext(AuthContext);
    const {semester, semesters, setSemester} = useContext(SemesterContext);
    const navigate = useNavigate();

    return (
        <Pane display="flex" padding={16} background="white" borderRadius={3} flexWrap="wrap">
            <Pane flex={1} alignItems="center" flexBasis="bottom" display="flex" flexWrap="wrap" marginY={8}>
                <Button marginLeft={20} appearance="minimal" onClick={() => navigate("/")}>
                    <Heading size={600}>Waitlist Watcher</Heading>
                </Button>

                <Button marginLeft={10} appearance="minimal"
                        onClick={() => navigate("/departments")}>Departments</Button>
                <div className={styles.search}>
                    <Search/>
                </div>
            </Pane>
            <Pane>
                <Select value={semester} onChange={event => setSemester(event.target.value)}>
                    {Object.entries(semesters).map(([key, val]) => (
                        <option value={key} key={key}>{val.name}</option>
                    ))}
                </Select>
                {!isAuthed ? (
                    <Button marginLeft={10} appearance="primary" onClick={() => navigate("/login")}>Get Started</Button>
                ) : (
                    <>
                        <Button appearance="minimal"
                                onClick={() => navigate("/profile")}>{getUser()?.email ?? '<loading>'}</Button>
                        <Button marginRight={8} intent="danger" appearance="minimal" onClick={logout}>Logout</Button>
                    </>
                )}
            </Pane>
        </Pane>
    );
}

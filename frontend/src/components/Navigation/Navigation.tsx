import {Button, Select} from "evergreen-ui";
import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {NavLink} from "react-router-dom";
import {Search} from "../Search/Search";
import {useSemesterContext} from "../../context/SemesterContext";
import styles from './Navigation.module.css'

export function Navigation() {
    const {isAuthed, getUser, logout} = useContext(AuthContext);
    const {semester, semesters, setSemester} = useSemesterContext();

    return (
        <header className={styles.header}>
            <nav className={styles.navigation} aria-label="Main navigation">
                <NavLink to="/" className={styles.brand}>Waitlist Watcher</NavLink>
                <div className={styles.links}>
                    <NavLink to="/departments" className={({isActive}) => isActive ? styles.active : styles.link}>Departments</NavLink>
                    <NavLink to="/stats" className={({isActive}) => isActive ? styles.active : styles.link}>Stats</NavLink>
                </div>
                <div className={styles.search}><Search/></div>
                <div className={styles.account}>
                    <Select aria-label="Semester" value={semester.id} onChange={event => setSemester(event.target.value)}>
                        {Object.values(semesters).map(val => <option value={val.id} key={val.id}>{val.name}</option>)}
                    </Select>
                    {!isAuthed ? (
                        <NavLink to="/login" className={styles.start}>Get started</NavLink>
                    ) : (
                        <>
                            <NavLink to="/profile" className={styles.profile} title={getUser()?.email ?? "Your profile"}>Profile</NavLink>
                            <Button appearance="minimal" onClick={logout}>Log out</Button>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
}

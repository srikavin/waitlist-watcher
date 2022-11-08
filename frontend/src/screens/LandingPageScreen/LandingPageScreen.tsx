import {useContext} from "react";
import {AuthContext} from "../../context/AuthContext";
import {
    Button,
    Card,
    ChatIcon,
    CodeIcon,
    Heading,
    Icon,
    Link,
    ListItem,
    NotificationsIcon,
    Pane,
    Text,
    UnorderedList
} from "evergreen-ui";
import {CircleContainer} from "../../components/CircleContainer/CircleContainer";
import {NavLink} from "react-router-dom";
import {Search} from "../../components/Search/Search";

function NotificationInfo(props: { icon: any, title: string, description: string }) {
    return (
        <Pane display="flex" flexDirection="column" gap={10} flexGrow={1} alignItems="center">
            <CircleContainer size={64}>
                <Icon icon={props.icon} size={36} color="info"/>
            </CircleContainer>
            <Heading size={700}>{props.title}</Heading>
            <Pane maxWidth={200} textAlign="center">
                <Text size={600}>{props.description}</Text>
            </Pane>
        </Pane>
    );
}

export function LandingPageScreen() {
    const {isAuthed} = useContext(AuthContext);

    return (
        <Pane overflowX="hidden">
            <Pane width="100vw" background="tint1">
                <Card maxWidth={1000} marginRight="auto" marginLeft="auto" justifyContent="center"
                      height={250} paddingY={16} display="flex" flexDirection="column" flexGrow="0">
                    <Heading size={900} marginBottom={12}>Never miss an open seat again</Heading>
                    <Text size={600} marginBottom={16}>
                        Get notified of course and section removals, added sections, professor changes, seat
                        availability, and view historical data.
                    </Text>
                    <NavLink to={!isAuthed ? "/login" : "/departments"}>
                        <Button appearance="primary" width={100}>Get started</Button>
                    </NavLink>
                </Card>
            </Pane>

            <Pane maxWidth={1000} marginRight="auto" marginLeft="auto" justifyContent="center"
                  marginTop={32} display="flex" flexDirection="column">
                <Heading size={800} marginBottom={12}>Search for a course or section</Heading>
                <Search/>
            </Pane>

            <Pane width="100vw" marginY={64}>
                <Card maxWidth={1000} marginRight="auto" marginLeft="auto">
                    <Heading size={800} marginBottom={12}>Notification Options</Heading>
                    <Pane marginBottom={48}>
                        <Text size={600}>
                            Choose how you get notified from a variety of options.
                        </Text>
                    </Pane>
                    <Pane display="flex" justifyContent="center" marginBottom={48}>
                        <NotificationInfo
                            icon={<NotificationsIcon/>}
                            title="Push Notifications"
                            description="Get notified through your browser or phone"/>
                        <NotificationInfo
                            icon={<ChatIcon/>}
                            title="Discord"
                            description="Get notified in Discord Servers or DMs"/>
                        <NotificationInfo
                            icon={<CodeIcon/>}
                            title="Web Hooks"
                            description="Integrate with third-party apps using web hooks"/>
                    </Pane>
                </Card>
                <Card maxWidth={1000} marginRight="auto" marginLeft="auto" marginY={32}>
                    <Heading size={800} marginBottom={12}>Notification Types</Heading>
                    <Text size={600}>
                        Waitlist watcher watches for and can notify you of the following events:
                    </Text>

                    <UnorderedList style={{columns: 3}} marginTop={6}>
                        <ListItem>New Courses</ListItem>
                        <ListItem>New Sections</ListItem>
                        <ListItem>Removed Courses</ListItem>
                        <ListItem>Removed Sections</ListItem>
                        <ListItem>Course Name and Description Changes</ListItem>
                        <ListItem>Section Meeting Time Changes</ListItem>
                        <ListItem>Instructor Changes</ListItem>
                        <ListItem>Seat Changes</ListItem>
                        <ListItem>Waitlist and Holdfile Changes</ListItem>
                    </UnorderedList>
                </Card>
                <Card maxWidth={1000} marginRight="auto" marginLeft="auto" marginY={32}>
                    <Heading size={800} marginBottom={12}>Raw Data</Heading>
                    <Text size={600}>
                        Want to use the raw data for your own purposes?
                        Get the{" "}
                        <Link size={600} target="_blank"
                              href="https://waitlist-watcher.uk.r.appspot.com/raw/202301/CMSC/events">raw event
                            data</Link>{" "}
                        and{" "}
                        <Link size={600} target="_blank"
                              href="https://waitlist-watcher.uk.r.appspot.com/raw/202301/CMSC/snapshots">course history
                            snapshots</Link>.
                    </Text>
                </Card>
                <Card maxWidth={1000} marginRight="auto" marginLeft="auto">
                    <Heading size={800} marginBottom={12}>Contribute</Heading>
                    <Text size={600}>
                        This project is open source on <Link size={600}
                                                             href="https://github.com/srikavin/waitlist-watcher">Github.</Link>
                    </Text>
                </Card>
            </Pane>
        </Pane>
    );
}
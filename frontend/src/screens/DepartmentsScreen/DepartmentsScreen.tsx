import {CoursePrefixListing} from "../../components/CoursePrefixListing/CoursePrefixListing";
import {Heading, Text} from "evergreen-ui";

export function DepartmentsScreen() {
    return (
        <>
            <Heading size={900} marginBottom={12}>Departments</Heading>
            <Text size={600} marginBottom={16}>Choose a department</Text>
            <CoursePrefixListing/>
        </>
    );
}
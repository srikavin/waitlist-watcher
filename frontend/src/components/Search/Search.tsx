import {Autocomplete, TextInput} from "evergreen-ui"
import {useNavigate} from "react-router-dom";
import {useEffect, useState} from "react";

export const remoteData = {courses: []};
fetch("https://waitlist-watcher.uk.r.appspot.com/courses").then(e => e.json()).then((e) => {
    remoteData.courses = e;
});

export function Search() {
    const navigate = useNavigate();

    const [items, setItems] = useState<string[]>([]);

    useEffect(() => {
        setItems(remoteData.courses);
    }, [remoteData.courses])

    return (
        <Autocomplete
            title="Courses"
            onChange={changedItem => {
                if (changedItem)
                    navigate('/history/' + changedItem)
            }}
            items={items}
        >
            {subProps => {
                const {getInputProps, getRef} = subProps
                return (
                    <TextInput
                        placeholder="Search"
                        ref={getRef}
                        {...getInputProps()}
                        width="100%"
                        height={40}
                        fontSize={20}
                    />
                )
            }}
        </Autocomplete>
    );
}
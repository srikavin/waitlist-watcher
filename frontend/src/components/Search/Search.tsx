import {Autocomplete, TextInput} from "evergreen-ui"
import {useNavigate} from "react-router-dom";
import {useState} from "react";
import {ErrorBoundary} from "../../util/ErrorBoundary";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";

export function Search() {
    const navigate = useNavigate();
    const {courseListing} = useSemesterContext();
    const [inputValue, setInputValue] = useState("");

    return (
        <ErrorBoundary>
            <Autocomplete
                title="Courses"
                onChange={changedItem => {
                    if (changedItem) {
                        navigate('/history/' + changedItem)
                        setInputValue("");
                    }
                }}
                onInputValueChange={(val) => setInputValue(val)}
                inputValue={inputValue}
                items={courseListing}
                selectedItem={null}
            >
                {subProps => {
                    const {getInputProps, getRef} = subProps
                    return (
                        <TextInput
                            placeholder="Search for sections or courses"
                            ref={getRef}
                            {...getInputProps()}
                            width="100%"
                            height={40}
                            fontSize={20}
                        />
                    )
                }}
            </Autocomplete>
        </ErrorBoundary>
    );
}

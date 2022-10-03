import {Autocomplete, TextInput} from "evergreen-ui"
import {useNavigate} from "react-router-dom";
import {useContext, useState} from "react";
import {SemesterContext} from "../../context/SemesterContext";

export function Search() {
    const navigate = useNavigate();
    const {courseListing} = useContext(SemesterContext);
    const [inputValue, setInputValue] = useState("");

    return (
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

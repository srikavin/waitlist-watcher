import {Link, Text} from "evergreen-ui";
import {MouseEvent} from "react";

interface ProfessorNameProps {
    name: string
}

interface PlanetTerpProfessorResponse {
    name: string,
    slug: string,
    type: string,
    courses: string[],
    average_rating: number
}

export function ProfessorName(props: ProfessorNameProps) {
    const handleClick = (e: MouseEvent) => {
        (async () => {
            try {
                const result = await fetch("https://api.planetterp.com/v1/professor?" + new URLSearchParams({
                    name: props.name
                }));

                if (result.ok) {
                    const data: PlanetTerpProfessorResponse = await result.json();
                    window.open(`https://planetterp.com/professor/${data.slug}`, '_blank');
                    e.preventDefault();
                    return;
                }
            } catch (e) {
                console.error(e);
            }
        })();
    }

    if (props.name === 'Instructor: TBA') {
        return <Text>TBA</Text>
    }

    return <Link onClick={handleClick} target="_blank"
                 href={`https://planetterp.com/search?${new URLSearchParams({query: props.name})}`}>{props.name}</Link>;
}

export default function ProfessorNames(props: ProfessorNameProps) {
    return (
        <>
            {props.name.split(",").map((name, index) => (
                <div key={index}>
                    <ProfessorName name={name.trim()}/><br/>
                </div>
            ))}
        </>
    )
}

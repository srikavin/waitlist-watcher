import {Link} from "evergreen-ui";
import {useNavigate} from "react-router-dom";
import {useMemo} from "react";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";

export function CoursePrefixListing() {
    const navigate = useNavigate();
    const {courseListing} = useSemesterContext();
    const prefixes = useMemo(() => {
        const result = new Set<string>();
        for (const item of courseListing) {
            const match = item.match(/^[A-Z]{3,8}/);
            if (!match) continue;
            result.add(match[0]);
        }
        return Array.from(result).sort((a, b) => a.localeCompare(b));
    }, [courseListing]);

    return (
        <div style={{columnCount: 10, marginTop: 8}}>
            {prefixes.map((e) => (
                <div key={e}>
                    <Link onClick={() => navigate(`/department/${e}`)} href="#" color={"neutral"}>{e}</Link>
                </div>
            ))}
        </div>
    );
}

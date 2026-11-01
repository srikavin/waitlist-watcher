import {Link} from "react-router-dom";
import {useMemo} from "react";
import {useSemesterContext} from "@/frontend/src/context/SemesterContext";

export function CoursePrefixListing() {
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
        <div className="department-grid">
            {prefixes.map((e) => (
                <Link key={e} className="department-link" to={`/department/${e}`}>{e}</Link>
            ))}
        </div>
    );
}

import {Link} from "evergreen-ui";

import prefixes from "./prefixes.json";

export function CoursePrefixListing() {
    return (
        <div style={{columnCount: 10, marginTop: 8}}>
            {prefixes.map((e) => (
                <div key={e}>
                    <Link href={`/department/${e}`} color={"neutral"}>{e}</Link>
                </div>
            ))}
        </div>
    );
}
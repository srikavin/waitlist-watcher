import {Link} from "evergreen-ui";

import prefixes from "./prefixes.json";
import {useNavigate} from "react-router-dom";

export function CoursePrefixListing() {
    const navigate = useNavigate();

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
import styles from './CircleContainer.module.css'
import {PropsWithChildren} from "react";
import {Pane} from "evergreen-ui";

export function CircleContainer(props: PropsWithChildren<{ size: number }>) {
    return (
        <Pane className={styles.circle} background="#EBF0FF" width={props.size} height={props.size}>
            {props.children}
        </Pane>
    );
}
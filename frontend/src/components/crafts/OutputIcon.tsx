/**
 * OutputIcon.tsx — the framed game icon for whatever a craft order produces.
 *
 * Items and cargo have different shapes, different frames and different prop types, so there is no
 * one component that takes both — hence the tagged `CraftOutput` and this two-`Show` dispatch.
 * Shared by the craft browser's row cells and the craft detail page's header so a craft is drawn
 * the same in both.
 */
import {Show} from "solid-js";
import {CargoIcon, ItemIcon} from "~/components/shared/GameIcon";
import type {CraftOutput} from "~/lib/crafts/entries";

export function OutputIcon(props: {output: CraftOutput | null; small?: boolean}) {
    const item = () => props.output?.kind === "item" ? props.output.desc : null;
    const cargo = () => props.output?.kind === "cargo" ? props.output.desc : null;
    return (
        <>
            <Show when={item()}>{desc => <ItemIcon item={desc()} small={props.small ?? true}/>}</Show>
            <Show when={cargo()}>{desc => <CargoIcon cargo={desc()} small={props.small ?? true}/>}</Show>
        </>
    );
}

import {getAssetURL} from "~/lib/bitcraft-utils";

/** A hexite amount followed by the hexite shard icon. */
export function HexiteShardPrice(props: { amount: number }) {
    return (
        <span class="inline-flex items-center gap-1">
            {props.amount}
            <img src={getAssetURL("UI/hexite-shard")} class="size-4" alt="Hexite"/>
        </span>
    );
}

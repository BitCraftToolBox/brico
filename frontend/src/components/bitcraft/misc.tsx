import {Component, ComponentProps} from "solid-js";
import {Rarity} from "~/bindings/ts";
import {Tiers} from "~/lib/bitcraft-utils";
import {cn} from "~/lib/utils";

type TierIconProps = ComponentProps<"img"> & {
    tier: number,
    rarity?: Rarity
}

export const TierIcon: Component<TierIconProps> = (props) => {
    const inRange = props.tier <= 10 && props.tier >= 1;
    if (!inRange) return <div class="inline mx-1">{props.tier}</div>

    return (
        <img
            class={cn(`inline w-4 h-4 ${Tiers.getBackgroundColorClass(props.tier)}`, props.class)}
            src={`/assets/Randy UI/Badges/badge-tier-number-${props.tier}.webp`}
            alt={`Tier ${props.tier}`}
            style={{
                mask: "url('/assets/Randy UI/Badges/badge-tier-container.webp')",
                "mask-size": "contain"
            }}
        />
    )
}
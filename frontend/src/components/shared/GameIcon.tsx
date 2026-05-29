/**
 * GameIcon — Unified icon component for all game object types.
 * Replaces the duplicated ItemIcon, BuildingIcon, ResourceIcon patterns
 * with a single configurable component.
 */

import {useColorMode} from "@kobalte/core";
import {A, useNavigate} from "@solidjs/router";
import {Component, ComponentProps, JSX, Show, splitProps} from "solid-js";
import {BuildingDesc} from "~/bindings/src/building_desc_type";
import {CargoDesc} from "~/bindings/src/cargo_desc_type";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {getAssetURL, getBuildingTier, Rarities, Tiers} from "~/lib/bitcraft-utils";
import {getItemListSource} from "~/lib/relations";
import {cn} from "~/lib/utils";

// ─── Shape Definitions ──────────────────────────────────────────

/** Shape presets controlling width/height at each size */
export type IconShape = "tall" | "wide" | "square";

type ShapeSizeEntry = { container: [string, string]; icon: [string, string] };

// The frame graphic and actual item icon don't fully fit in-game. You can actually see gaps if you look closely enough.
// This annoys me enough that I've resized our containers (and icons, for the square shape) to better fit the two together.
const SHAPE_SIZES: Record<IconShape, { large: ShapeSizeEntry; small: ShapeSizeEntry }> = {
    // Items: tall and narrow
    tall: {
        /* true game sizes
        large: { container: ["w-[108px]", "h-[136px]"], icon: ["w-[78px]", "h-[104px]"] },
        small: { container: ["w-[54px]",  "h-[68px]"],  icon: ["w-[38px]", "h-[52px]"]  },
         */
        large: {container: ["w-[88px]", "h-[116px]"], icon: ["w-[78px]", "h-[104px]"]},
        small: {container: ["w-[44px]", "h-[58px]"], icon: ["w-[38px]", "h-[52px]"]},
    },
    // Cargo: short and wide
    wide: {
        /* true game sizes
        large: { container: ["w-[208px]", "h-[128px]"], icon: ["w-[184px]", "h-[104px]"] },
        small: { container: ["w-[104px]", "h-[64px]"],  icon: ["w-[97px]",  "h-[52px]"]  },
         */
        large: {container: ["w-[200px]", "h-[120px]"], icon: ["w-[184px]", "h-[104px]"]},
        small: {container: ["w-[100px]", "h-[60px]"], icon: ["w-[97px]", "h-[52px]"]},
    },
    // Buildings, resources, enemies, etc.: square
    square: {
        /* true game sizes
        large: { container: ["w-[130px]", "h-[130px]"], icon: ["w-[130px]", "h-[130px]"] },
        small: { container: ["w-[65px]",  "h-[65px]"],  icon: ["w-[65px]",  "h-[65px]"]  },
         */
        large: {container: ["w-[130px]", "h-[130px]"], icon: ["w-[120px]", "h-[120px]"]},
        small: {container: ["w-[65px]", "h-[65px]"], icon: ["w-[60px]", "h-[60px]"]},
    },
};

/** Map shape to frame image filename prefix */
const FRAME_PREFIX: Record<IconShape, string> = {
    tall: "item-frame",
    square: "creaturebuildingresource-frame",
    wide: "cargo-frame",
};

/** Map a Rarity to the corresponding frame filename slug */
export function rarityToFrameSlug(rarity?: Rarity): string {
    if (!rarity) return "basic";
    switch (rarity.tag) {
        case Rarity.Common.tag:
            return "common";
        case Rarity.Uncommon.tag:
            return "uncommon";
        case Rarity.Rare.tag:
            return "rare";
        case Rarity.Epic.tag:
            return "epic";
        case Rarity.Legendary.tag:
            return "legendary";
        case Rarity.Mythic.tag:
            return "mythic";
        default:
            return "basic";
    }
}

// ─── Props ──────────────────────────────────────────────────────

export type GameIconProps = Omit<ComponentProps<"div">, "children"> & {
    /** Display name (used in tooltip) */
    name: string;
    /** Path to the icon asset (passed to getAssetURL) */
    iconAsset: string;
    /** Shape of the icon container */
    shape: IconShape;
    /** Whether to render at small size (default: true) */
    small?: boolean;
    /** Tier value for background color */
    tier?: number;
    /** Rarity value for border color */
    rarity?: Rarity;
    /** Navigation route when clicked */
    href?: string;
    /** Disable click/tooltip interaction */
    noInteract?: boolean;
    /** Tooltip content override */
    tooltipContent?: JSX.Element;
    /** Quantity for asset URL variants (e.g. hex coin) */
    quantity?: number;
    /**
     * When set, clicking the icon navigates to the href with a query-string appended.
     * - string: always appended as `?<clickParams>` on left-click.
     * - [string, string]: first element on left-click, second on right-click (context menu).
     * Ctrl/Meta/Shift clicks pass through to the browser normally.
     */
    clickParams?: string | [string, string];
};

type TierIconProps = ComponentProps<"img" | "div"> & {
    tier: number,
}

// ─── Component ──────────────────────────────────────────────────

export const TierIcon: Component<TierIconProps> = (props) => {
    const inRange = props.tier >= 1 && props.tier <= 10;
    if (!inRange) return (
        <div class={cn("inline-block relative", props.class)} title={`Tier ${props.tier}`}>
            <img
                class={"w-4 h-4"}
                src={`/assets/Badges/badge-tier-container.webp`}
                alt={`Tier ${props.tier}`}
                style={{
                    // hardcoded to T0 color #413A64
                    filter: "brightness(0) saturate(100%) invert(21%) sepia(19%) saturate(1384%) hue-rotate(210deg) brightness(96%) contrast(89%)",
                }}
            />
            <p class={"absolute text-xs select-none " +
                "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] " +
                "text-background dark:text-foreground"
            }>{props.tier}</p>
        </div>
    );

    return (
        <img
            class={cn(`inline w-4 h-4 ${Tiers.getBackgroundColorClass(props.tier)}`, props.class)}
            src={`/assets/Badges/badge-tier-number-${props.tier}.webp`}
            alt={`Tier ${props.tier}`}
            title={`Tier ${props.tier}`}
            style={{
                mask: "url('/assets/Badges/badge-tier-container.webp')",
                "mask-size": "contain"
            }}
        />
    )
}

export const GameIcon: Component<GameIconProps> = (props) => {
    const [local, others] = splitProps(props, [
        "class", "name", "iconAsset", "shape", "small", "tier", "rarity",
        "href", "noInteract", "tooltipContent", "quantity", "clickParams",
    ]);

    const small = () => local.small ?? true;
    const noInteract = () => local.noInteract ?? false;
    const {colorMode} = useColorMode();
    const navigate = useNavigate();

    const sizeEntry = () => {
        const preset = SHAPE_SIZES[local.shape];
        return small() ? preset.small : preset.large;
    };

    const containerDims = () => sizeEntry().container.join(" ");
    const iconDims = () => sizeEntry().icon.join(" ");

    const bgColor = () => local.tier !== undefined ? Tiers.getBackgroundColorClass(local.tier) : "";
    const borderColor = () => local.rarity ? Rarities.getBorderColorClass(local.rarity) : "";
    const path = () => getAssetURL(local.iconAsset, local.quantity);

    const frameSrc = () => {
        const prefix = FRAME_PREFIX[local.shape];
        const slug = rarityToFrameSlug(local.rarity);
        const theme = colorMode() === "dark" ? "dark" : "light";
        return `/assets/Frames/${prefix}-${slug}-${theme}.webp`;
    };

    const defaultTooltip = () => (
        <div class={"flex flex-row items-center"}>
            {local.name}
            <Show when={local.tier !== undefined}>
                <TierIcon tier={local.tier!} class={"ml-1"}/>
            </Show>
            <Show when={local.rarity}>
                , {local.rarity!.tag}
            </Show>
        </div>
    );

    const handleClick = (e: MouseEvent) => {
        if (!local.clickParams || !local.href) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let browser handle modifier clicks
        e.preventDefault();
        const param = Array.isArray(local.clickParams) ? local.clickParams[0] : local.clickParams;
        navigate(`${local.href}?${param}`);
    };

    const handleContextMenu = (e: MouseEvent) => {
        if (!local.clickParams || !local.href) return;
        if (!Array.isArray(local.clickParams)) return;
        e.preventDefault();
        navigate(`${local.href}?${local.clickParams[1]}`);
    };

    const iconDiv = () => (
        <div
            class={cn(
                `relative mx-1 overflow-hidden ${containerDims()}`,
                local.class,
            )}
            {...others}
        >
            {/* The actual icon, centered within the frame container */}
            <img
                src={path()}
                //src={"/assets/Frames/item-empty.webp"}
                //src={"/assets/Frames/item-frame.webp"}
                alt={local.name}
                class={`${bgColor()} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain ${iconDims()}`}
                onerror={(e) => ((e.target as HTMLImageElement).src = "/assets/Unknown.webp")}
            />
            {/* Game frame image overlaid on top */}
            <img
                src={frameSrc()}
                alt=""
                aria-hidden="true"
                class="absolute inset-0 w-full h-full object-fill pointer-events-none"
            />
        </div>
    );

    return (
        <Tooltip disabled={noInteract()}>
            <Show when={local.href && !noInteract()}
                  fallback={
                      <TooltipTrigger as={"span"}>
                          {iconDiv()}
                      </TooltipTrigger>
                  }>
                <TooltipTrigger as={A} href={local.href ?? "#"} class={"cursor-pointer"}
                                onClick={handleClick}
                                onContextMenu={handleContextMenu}
                >
                    {iconDiv()}
                </TooltipTrigger>
            </Show>
            <TooltipContent class={borderColor() ? `border ${borderColor()}` : ""}>
                {local.tooltipContent ?? defaultTooltip()}
            </TooltipContent>
        </Tooltip>
    );
};

// ─── Convenience Wrappers ───────────────────────────────────────
// These provide typed, domain-specific interfaces while delegating to GameIcon.


type ItemIconProps = Omit<ComponentProps<"div">, "children"> & {
    item: ItemDesc;
    small?: boolean;
    noInteract?: boolean;
    quantity?: number;
};

export const ItemIcon: Component<ItemIconProps> = (props) => {
    const [local, others] = splitProps(props, ["item", "quantity"]);

    return (
        <GameIcon
            name={props.item.name}
            iconAsset={props.item.iconAssetName}
            tier={props.item.tier}
            rarity={props.item.rarity}
            href={`/database/item/${props.item.id}`}
            quantity={local.quantity}
            shape="tall"
            clickParams={["detail=crafts-from", "detail=crafts-into"]}
            {...others}
        />
    );
};

type CargoIconProps = Omit<ComponentProps<"div">, "children"> & {
    cargo: CargoDesc;
    quantity?: number;
    small?: boolean;
    noInteract?: boolean;
};

export const CargoIcon: Component<CargoIconProps> = (props) => {
    const [local, others] = splitProps(props, ["cargo", "quantity"]);

    return (
        <GameIcon
            name={props.cargo.name}
            iconAsset={props.cargo.iconAssetName}
            tier={props.cargo.tier}
            rarity={props.cargo.rarity}
            quantity={local.quantity}
            href={`/database/cargo/${props.cargo.id}`}
            shape="wide"
            clickParams={["detail=crafts-from", "detail=crafts-into"]}
            {...others}
        />
    )
};

type BuildingIconProps = Omit<ComponentProps<"div">, "children"> & {
    building: BuildingDesc;
    small?: boolean;
    noInteract?: boolean;
};

export const BuildingIcon: Component<BuildingIconProps> = (props) => {
    const [local, others] = splitProps(props, ["building"]);

    return (
        <GameIcon
            name={local.building.name}
            iconAsset={local.building.iconAssetName}
            tier={getBuildingTier(local.building)}
            href={`/database/building/${local.building.id}`}
            shape="square"
            {...others}
        />
    );
};

type ResourceIconProps = Omit<ComponentProps<"div">, "children"> & {
    res: ResourceDesc;
    small?: boolean;
    noInteract?: boolean;
};

export const ResourceIcon: Component<ResourceIconProps> = (props) => {
    const [local, others] = splitProps(props, ["res"]);

    return (
        <GameIcon
            name={local.res.name}
            iconAsset={local.res.iconAssetName}
            tier={local.res.tier}
            rarity={local.res.rarity}
            href={`/database/resource/${local.res.id}`}
            shape="square"
            {...others}
        />
    );
};

type EnemyIconProps = Omit<ComponentProps<"div">, "children"> & {
    enemy: EnemyDesc;
    small?: boolean;
    noInteract?: boolean;
};

export const EnemyIcon: Component<EnemyIconProps> = (props) => {
    const [local, others] = splitProps(props, ["enemy"]);
    return (
        <GameIcon
            name={local.enemy.name}
            iconAsset={local.enemy.iconAddress}
            tier={local.enemy.tier}
            rarity={local.enemy.rarity}
            href={`/database/creature/${local.enemy.enemyType}`}
            shape="square"
            {...others}
        />
    );
};

type CollectibleIconProps = Omit<ComponentProps<"div">, "children"> & {
    collectible: CollectibleDesc;
    small?: boolean;
    noInteract?: boolean;
};

export const CollectibleIcon: Component<CollectibleIconProps> = (props) => {
    const [local, others] = splitProps(props, ["collectible"]);
    return (
        <GameIcon
            name={local.collectible.name}
            iconAsset={local.collectible.iconAssetName}
            rarity={local.collectible.collectibleRarity}
            href={`/database/collectible/${local.collectible.id}`}
            shape="square"
            {...others}
        />
    )
};

type PlaceableIconProps = Omit<ComponentProps<"div">, "children"> & {
    placeable: PlaceableDesc;
    small?: boolean;
    noInteract?: boolean;
};

export const PlaceableIcon: Component<PlaceableIconProps> = (props) => {
    const [local, others] = splitProps(props, ["placeable"]);
    return (
        <GameIcon
            name={local.placeable.name}
            iconAsset={local.placeable.iconAssetName}
            tier={local.placeable.tier}
            rarity={local.placeable.rarity}
            href={`/database/placeable/${local.placeable.id}`}
            shape="square"
            {...others}
        />
    );
};

type ItemListSourceIconProps = Omit<ComponentProps<"div">, "children"> & {
    list: ItemListDesc;
    small?: boolean;
    noInteract?: boolean;
}

export const ItemListSourceIcon: Component<ItemListSourceIconProps> = (props) => {
    const [local, others] = splitProps(props, ["list"]);

    const source = getItemListSource(local.list);
    switch (source.type) {
        case "Item":
            return <ItemIcon item={source.item} {...others} />;
        case "Enemy":
            return source.enemy ? <EnemyIcon enemy={source.enemy} {...others} /> : <></>;
        case "Unknown":
        default:
            return <></>;
    }
}

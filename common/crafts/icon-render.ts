/**
 * Framework-free lookup tables for rendering a game-styled item/cargo icon (tier-colored background,
 * sprite, rarity frame), shared with `backend/brico-bot`'s sharp-based compositor. Always the dark
 * theme. `ICON_CONTAINER_SIZE`/`ICON_SPRITE_SIZE` mirror `GameIcon.tsx`'s `SHAPE_SIZES.tall`/`.wide`
 * `large` entries and `DARK_TIER_COLOR_HEX` mirrors the dark `--bc-tier-color-N` values in `app.css`;
 * keep them in sync by hand.
 */

/** A crafting recipe only produces an item or cargo, so unlike `GameIcon.tsx`'s `IconShape` there is no `"square"`. */
export type IconShape = "item" | "cargo";

/** `GameIcon.tsx`'s `FRAME_PREFIX`, restricted to the two shapes this ever renders. */
export const ICON_FRAME_PREFIX: Record<IconShape, string> = {
    item: "item-frame",
    cargo: "cargo-frame",
};

export interface IconDims {
    width: number;
    height: number;
}

/** The full icon container, frame included. */
export const ICON_CONTAINER_SIZE: Record<IconShape, IconDims> = {
    item: {width: 88, height: 116},
    cargo: {width: 200, height: 120},
};

/** The sprite/background box the frame's cutout reveals, centered within `ICON_CONTAINER_SIZE`. */
export const ICON_SPRITE_SIZE: Record<IconShape, IconDims> = {
    item: {width: 78, height: 104},
    cargo: {width: 184, height: 104},
};

/** Side of the square output image; the composite is scaled to fit and centered on transparent padding, since Discord's `Thumbnail` is square. */
export const ICON_CANVAS_SIZE = 128;

/** Maps a rarity tag to a frame filename slug (mirrors `GameIcon.tsx`'s `rarityToFrameSlug`); `undefined` and `"Default"` map to `"basic"`. */
export function rarityToFrameSlug(rarityTag: string | undefined): string {
    switch (rarityTag) {
        case "Common":
            return "common";
        case "Uncommon":
            return "uncommon";
        case "Rare":
            return "rare";
        case "Epic":
            return "epic";
        case "Legendary":
            return "legendary";
        case "Mythic":
            return "mythic";
        default:
            return "basic";
    }
}

/** Dark-theme `--bc-tier-color-N` from `frontend/src/app.css`, indexed 0–10. */
export const DARK_TIER_COLOR_HEX: readonly string[] = [
    "#413A64", // 0
    "#636A74", // 1
    "#875F45", // 2
    "#5C6F4D", // 3
    "#49619C", // 4
    "#814F87", // 5
    "#983A44", // 6
    "#947014", // 7
    "#538484", // 8
    "#464953", // 9
    "#97AFBE", // 10
];

/** Clamps `tier` into `DARK_TIER_COLOR_HEX`'s 0–10 range. */
export function tierColorHex(tier: number): string {
    const index = Math.min(Math.max(Math.round(tier), 0), DARK_TIER_COLOR_HEX.length - 1);
    return DARK_TIER_COLOR_HEX[index];
}

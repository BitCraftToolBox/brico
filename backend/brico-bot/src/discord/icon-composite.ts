/**
 * icon-composite.ts — renders an item/cargo's game-styled icon (tier background + sprite + rarity
 * frame, as `GameIcon.tsx` draws it) into one `.webp` with `sharp`, cached in memory for the life
 * of the process (CDN assets and final icons alike).
 */
import {ICON_CANVAS_SIZE, ICON_CONTAINER_SIZE, ICON_FRAME_PREFIX, ICON_SPRITE_SIZE, type IconShape, rarityToFrameSlug, tierColorHex,} from "@brico/crafts/icon-render";
import sharp from "sharp";

import type {ItemIconFacts} from "../game-data/item-icons.ts";

async function fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`asset fetch failed (${res.status}): ${url}`);
    return Buffer.from(await res.arrayBuffer());
}

/** Keyed async memoizer; failures are evicted so the next request retries. */
function memoize<V>(): (key: string, compute: () => Promise<V>) => Promise<V> {
    const cache = new Map<string, Promise<V>>();
    return (key, compute) => {
        let entry = cache.get(key);
        if (!entry) {
            entry = compute().catch(cause => {
                cache.delete(key);
                throw cause;
            });
            cache.set(key, entry);
        }
        return entry;
    };
}

export interface IconRenderer {
    /** Renders (or returns the cached render of) one item/cargo's icon as a `.webp` buffer. */
    render(shape: IconShape, id: number, facts: ItemIconFacts): Promise<Buffer>;
}

export function createIconRenderer(assetCdnBase: string): IconRenderer {
    const sprite = memoize<Buffer>();
    const frame = memoize<Buffer>();
    const composite = memoize<Buffer>();

    async function renderComposite(shape: IconShape, facts: ItemIconFacts): Promise<Buffer> {
        const raritySlug = rarityToFrameSlug(facts.rarityTag);
        const container = ICON_CONTAINER_SIZE[shape];
        const iconBox = ICON_SPRITE_SIZE[shape];
        const left = Math.round((container.width - iconBox.width) / 2);
        const top = Math.round((container.height - iconBox.height) / 2);

        const [spriteRaw, frameRaw] = await Promise.all([
            sprite(facts.iconAssetName, () => fetchBuffer(`${assetCdnBase}/sprites/${facts.iconAssetName}.webp`)),
            frame(`${shape}:${raritySlug}`, () => fetchBuffer(`${assetCdnBase}/UI/Frames/${ICON_FRAME_PREFIX[shape]}-${raritySlug}-dark.webp`)),
        ]);

        // Sprite letterboxed into its box (`object-contain`) with the tier color behind it (`dest-over`).
        const spriteLayer = await sharp(spriteRaw)
            .resize(iconBox.width, iconBox.height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}})
            .composite([{
                input: {create: {width: iconBox.width, height: iconBox.height, channels: 4, background: tierColorHex(facts.tier)}},
                blend: "dest-over",
            }])
            .png()
            .toBuffer();

        // Frame stretched to fill the container (`object-fill`); its cutout reveals the sprite.
        const frameLayer = await sharp(frameRaw)
            .resize(container.width, container.height, {fit: "fill"})
            .toBuffer();

        const containerImage = await sharp({create: {width: container.width, height: container.height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
            .composite([
                {input: spriteLayer, left, top},
                {input: frameLayer, left: 0, top: 0},
            ])
            .png()
            .toBuffer();

        // Fit the (non-square) container, uncropped, into a square canvas, since Discord thumbnails are square.
        return sharp(containerImage)
            .resize(ICON_CANVAS_SIZE, ICON_CANVAS_SIZE, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}})
            .webp()
            .toBuffer();
    }

    return {
        render(shape, id, facts) {
            const raritySlug = rarityToFrameSlug(facts.rarityTag);
            return composite(`${shape}:${id}:${facts.tier}:${raritySlug}`, () => renderComposite(shape, facts));
        },
    };
}

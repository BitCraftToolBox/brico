/**
 * Game strings for values that are *tags*, not text.
 *
 * `translateRow` (see `~/lib/data-translation`) rewrites top-level string fields on a row. It can't
 * touch a sum-type tag nested inside one — `ItemDesc.rarity.tag`, `CsvStatEntry.id.tag`,
 * `EquipmentDesc.slots[].tag` — and it shouldn't: those tags are load-bearing identity. Rarity
 * drives the frame/border colors, stat tags are filter keys and URL params. They stay canonical in
 * the data and get translated only on the way to the screen.
 *
 * That takes two steps, because a tag is not the string the player sees:
 *
 *   1. **tag → official English name.** The client keeps its own mapping, e.g.
 *      `CharacterStatType.MaxHealth` displays as "Maximum Health", not "Max Health". The
 *      `*_NAMES` tables below record those. Anything not listed falls back to `splitCamelCase`,
 *      which is what every call site did before and is right for the many tags whose name really
 *      is just their split tag ("Armor", "Cooldown Multiplier").
 *   2. **English name → translated.** `translateGameText` matches that English string against the
 *      game catalogs, so "Maximum Health" becomes "Maximale Gesundheit".
 *
 * The `*Label` functions do both and are reactive; the `*Name` functions stop after step 1 and are
 * the ones to compare against, sort by, or put in a URL.
 *
 * The name tables are deliberately `Partial` and hand-maintained: BitCraft's client data isn't
 * directly accessible, so entries land as they're confirmed. A missing entry degrades to the split
 * tag rather than breaking, and `Partial<Record<Tag, string>>` still gives autocomplete over the
 * full tag list when filling one in.
 */

import type CharacterStatType from "~/bindings/src/character_stat_type_type";
import type CollectibleType from "~/bindings/src/collectible_type_type";
import type EquipmentSlotType from "~/bindings/src/equipment_slot_type_type";
import type {Rarity} from "~/bindings/src/rarity_type";
import {translateGameText} from "~/lib/data-translation";
import {splitCamelCase} from "~/lib/utils";

/** tag → official English display name. Anything absent falls back to `splitCamelCase(tag)`. */
type NameTable<T extends string> = Partial<Record<T, string>>;

function nameOf<T extends string>(table: NameTable<T>, tag: string | undefined): string {
    if (!tag) return "";
    return table[tag as T] ?? splitCamelCase(tag);
}

// ── Character stats ───────────────────────────────────────────

/**
 * Only tags whose official name differs from `splitCamelCase(tag)` need listing.
 * Note that tool powers are displayed on the stat sheet as "{0} Power" (with the
 * placeholder being the ToolType string), but these are not actual CharacterStatTypes.
 */
export const CHARACTER_STAT_NAMES: NameTable<CharacterStatType["tag"]> = {
    MaxHealth: "Maximum Health",
    MaxStamina: "Maximum Stamina",
    MaxSatiation: "Maximum Satiation",
    HuntingPower: "Hunting Strength",
    PassiveHealthRegenRate: "Passive Health Regeneration Rate",
    ActiveHealthRegenRate: "Active Health Regeneration Rate",
    PassiveStaminaRegenRate: "Passive Stamina Regeneration Rate",
    ActiveStaminaRegenRate: "Active Stamina Regeneration Rate",
};

/** Canonical English name for a stat tag. Use this for sorting, filter keys and comparisons. */
export function statName(tag: string | undefined): string {
    return nameOf(CHARACTER_STAT_NAMES, tag);
}

/** Display name for a stat tag, translated into the active data locale. Reactive. */
export function statLabel(tag: string | undefined): string {
    return translateGameText(statName(tag));
}

// ── Collectible Type ──────────────────────────────────────────

/**
 * As stats, only tags which differ from the `splitCamelCase`.
 * These are the names shown when hovering category icons
 * in the "Closet" tab of the Vault, and the names of the other
 * Vault tabs.
 */
export const COLLECTIBLE_TYPE_NAMES: NameTable<CollectibleType["tag"]> = {
    Hair: "Hair Style",
    ClothesHead: "Head",
    ClothesTorso: "Torso",
    ClothesBelt: "Belt",
    ClothesCape: "Cape",
    ClothesLegs: "Legs",
    ClothesArms: "Hands",
    ClothesFeet: "Feet",
    DeployableAppearanceOverride: "Deployable Appearance",
    Deployable: "Deployables",
    Pet: "Pets",
    PremiumItem: "Premium Items",
    Emote: "Emotes",
    HousingWalls: "Walls",
    HousingFloor: "Floors"
};

export function collectibleTypeName(tag: string | undefined): string {
    return nameOf(COLLECTIBLE_TYPE_NAMES, tag);
}

export function collectibleTypeLabel(tag: string | undefined): string {
    return translateGameText(collectibleTypeName(tag));
}

// ── Rarity ────────────────────────────────────────────────────

/**
 * Rarity tags happen to read as their own display names, so this table exists mostly to document that.
 */
export const RARITY_NAMES: NameTable<Rarity["tag"]> = {};

/** Canonical English name for a rarity tag — what `rarityColumn` stores and what URLs carry. */
export function rarityName(tag: string | undefined): string {
    return nameOf(RARITY_NAMES, tag);
}

/** Display name for a rarity tag, translated into the active data locale. Reactive. */
export function rarityLabel(tag: string | undefined): string {
    return translateGameText(rarityName(tag));
}

// ── Equipment slots ───────────────────────────────────────────

/**
 * Equipment slots mostly read as their own display names, despite some very odd ones like "Head Artifact"
 * for the heart slot and "Feet Artifact" for the trinket. This is here in case CWL changes those.
 */
export const EQUIPMENT_SLOT_NAMES: NameTable<EquipmentSlotType["tag"]> = {
    MainHand: "Main Hand Equipment",
    OffHand: "Off Hand Equipment"
};

/** Canonical English name for an equipment slot tag. */
export function equipmentSlotName(tag: string | undefined): string {
    return nameOf(EQUIPMENT_SLOT_NAMES, tag);
}

/** Display name for an equipment slot tag, translated into the active data locale. Reactive. */
export function equipmentSlotLabel(tag: string | undefined): string {
    return translateGameText(equipmentSlotName(tag));
}


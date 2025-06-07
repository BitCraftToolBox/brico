import {ItemStack, ItemType, Rarity} from "~/bindings/ts";
import {BitCraftTables} from "~/lib/spacetime";


export class Rarities {
    static rarities = [
        Rarity.Default.tag,
        Rarity.Common.tag,
        Rarity.Uncommon.tag,
        Rarity.Rare.tag,
        Rarity.Epic.tag,
        Rarity.Legendary.tag,
        Rarity.Mythic.tag,
    ]

    static toValue(r: Rarity): number {
        switch (r.tag) {
            case Rarity.Common.tag:
                return 1;
            case Rarity.Uncommon.tag:
                return 2;
            case Rarity.Rare.tag:
                return 3;
            case Rarity.Epic.tag:
                return 4;
            case Rarity.Legendary.tag:
                return 5
            case Rarity.Mythic.tag:
                return 6;
            case Rarity.Default.tag:
            default:
                return 0;
        }
    }

    static getBorderColorClass(r: Rarity) {
        switch (r.tag) {
            case Rarity.Mythic.tag: return "border-rarity-border6";
            case Rarity.Legendary.tag: return "border-rarity-border5";
            case Rarity.Epic.tag: return "border-rarity-border4";
            case Rarity.Rare.tag: return "border-rarity-border3";
            case Rarity.Uncommon.tag: return "border-rarity-border2";
            case Rarity.Common.tag: return "border-rarity-border1";
            default: return "border-rarity-border0";
        }
    }
}

export class Tiers {
    static tiers = [
        {label: '-', value: -1},
        {label: '0', value: 0},
        {label: 'I', value: 1},
        {label: 'II', value: 2},
        {label: 'III', value: 3},
        {label: 'IV', value: 4},
        {label: 'V', value: 5},
        {label: 'VI', value: 6},
        {label: 'VII', value: 7},
        {label: 'VIII', value: 8},
        {label: 'IX', value: 9},
        {label: 'X', value: 10},
    ]

    static getBackgroundColorClass(tier: number) {
        switch (tier) {
            // don't combine these. type union needed for tailwind generation.
            case 10: return "bg-tier-bg10";
            case 9: return "bg-tier-bg9";
            case 8: return "bg-tier-bg8";
            case 7: return "bg-tier-bg7";
            case 6: return "bg-tier-bg6";
            case 5: return "bg-tier-bg5";
            case 4: return "bg-tier-bg4";
            case 3: return "bg-tier-bg3";
            case 2: return "bg-tier-bg2";
            case 1: return "bg-tier-bg1";
            default: return "bg-tier-bg0";
        }
    }
}

export function stackToItemOrCargo(stack: ItemStack | [string, number]) {
    let itemType, itemId;
    if (Array.isArray(stack)) {
        itemType = stack[0];
        itemId = stack[1];
    } else {
        itemType = stack.itemType.tag;
        itemId = stack.itemId;
    }
    if (itemType == ItemType.Item.tag) {
        return BitCraftTables.ItemDesc.indexedBy("id")!()!.get(itemId)!;
    } else if (itemType == ItemType.Cargo.tag) {
        return BitCraftTables.CargoDesc.indexedBy("id")!()!.get(itemId)!;
    } else {
        throw new Error("ItemStack isn't Item or Cargo.");
    }
}

export function cleanAssetPath(path: string, quantity?: number) {
    if (path.startsWith("Items/HexCoin")) {
        // TODO parse out Items/HexCoin[,3,10,500] properly
        if (!quantity || quantity < 3) {
            return "OldGeneratedIcons/Items/HexCoin";
        } else if (quantity < 10) {
            return "OldGeneratedIcons/Items/HexCoin3";
        } else if (quantity < 500) {
            return "OldGeneratedIcons/Items/HexCoin10";
        } else {
            return "OldGeneratedIcons/Items/HexCoin500";
        }
    }
    if (!path.startsWith('GeneratedIcons/')) {
        return "OldGeneratedIcons/" + path;
    }
    return path.replace("GeneratedIcons/Other/GeneratedIcons", "GeneratedIcons");
}
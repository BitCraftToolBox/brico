import {Accessor, createMemo} from "solid-js";
import {BuildingDesc} from "~/bindings/src/building_desc_type";
import {PathfindingDesc} from "~/bindings/src/pathfinding_desc_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {ASSET_CDN_BASE} from "~/lib/constants";


export class Rarities {
    static rarities = [
        Rarity.Default.tag as Rarity["tag"],
        Rarity.Common.tag as Rarity["tag"],
        Rarity.Uncommon.tag as Rarity["tag"],
        Rarity.Rare.tag as Rarity["tag"],
        Rarity.Epic.tag as Rarity["tag"],
        Rarity.Legendary.tag as Rarity["tag"],
        Rarity.Mythic.tag as Rarity["tag"],
    ] satisfies Rarity["tag"][];

    static toValue(r: Rarity["tag"]): number {
        switch (r) {
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
            case Rarity.Mythic.tag:
                return "border-rarity-border6";
            case Rarity.Legendary.tag:
                return "border-rarity-border5";
            case Rarity.Epic.tag:
                return "border-rarity-border4";
            case Rarity.Rare.tag:
                return "border-rarity-border3";
            case Rarity.Uncommon.tag:
                return "border-rarity-border2";
            case Rarity.Common.tag:
                return "border-rarity-border1";
            default:
                return "border-rarity-border0";
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
            case 10:
                return "bg-tier-bg10";
            case 9:
                return "bg-tier-bg9";
            case 8:
                return "bg-tier-bg8";
            case 7:
                return "bg-tier-bg7";
            case 6:
                return "bg-tier-bg6";
            case 5:
                return "bg-tier-bg5";
            case 4:
                return "bg-tier-bg4";
            case 3:
                return "bg-tier-bg3";
            case 2:
                return "bg-tier-bg2";
            case 1:
                return "bg-tier-bg1";
            default:
                return "bg-tier-bg0";
        }
    }

    static getMapColor(tier: number) {
        switch (tier) {
            case 1: return "#838e9e";
            case 2: return "#a8663a";
            case 3: return "#00f630";
            case 4: return "#2d6bff";
            case 5: return "#a349af";
            case 6: return "#bd2c3b";
            case 7: return "#c09015";
            case 8: return "#5ae2e2";
            case 9: return "#1f1f1f";
            case 10: return "#deffff"
        }
        return "#413a64";
    }
}

export function getAssetURL(path: string, quantity?: number) {
    if (!path) {
        return '/assets/Unknown.webp';
    }
    // match <path>[,n1,n2,...], used by hex coins
    const bracketMatch = path.match(/^([/\w]+)(\[(,\d+)+])$/);
    if (bracketMatch) {
        const baseName = bracketMatch[1];
        const bracketNumbers = bracketMatch[2];
        let quantities: number[] = [];
        if (bracketNumbers) {
            quantities = bracketNumbers.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
            quantities.sort((a, b) => a - b);
        }
        if (!quantity || quantities.length === 0) {
            path = `${baseName}`;
        } else {
            let selected = quantities[0];
            for (const n of quantities) {
                if (quantity >= n) {
                    selected = n;
                } else {
                    break;
                }
            }
            path = `${baseName}${selected !== undefined ? selected : ''}`;
        }
    }
    return `${ASSET_CDN_BASE}/sprites/${path}.webp`;
}

export function getBuildingTier(building: BuildingDesc) {
    return Math.max(...building.functions.map(func => func.level), ...[0]);
}

export function checkStepHeight(pathfinding: Accessor<PathfindingDesc | undefined>) {
    const maxStepUp = createMemo(() => {
        const p = pathfinding();
        if (!p?.climbUpOptions?.length) return undefined;
        return Math.max(...p.climbUpOptions.map(o => o.maxElevationDifference));
    });

    const maxStepDown = createMemo(() => {
        const p = pathfinding();
        if (!p?.climbDownOptions?.length) return undefined;
        return Math.min(...p.climbDownOptions.map(o => o.maxElevationDifference));
    });

    const stepIsSymmetric = createMemo(() => {
        const up = maxStepUp();
        const down = maxStepDown();
        return up !== undefined && down !== undefined && up === -down;
    })

    const labels = createMemo(() => {
        return [
            {label: stepIsSymmetric() ? "Step Height" : "Step Up", value: maxStepUp()},
            ...(!stepIsSymmetric ? [{label: "Step Down", value: maxStepDown()}] : []),
        ]
    })

    return {
        maxStepUp,
        maxStepDown,
        stepIsSymmetric,
        labels
    }
}
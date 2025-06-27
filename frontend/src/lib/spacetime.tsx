import {AlgebraicType, BinaryReader} from "@clockworklabs/spacetimedb-sdk";
import {
    BiomeDesc,
    BuffDesc,
    BuildingDesc,
    BuildingRepairsDesc,
    BuildingTypeDesc,
    CargoDesc,
    ClaimTechDesc,
    CollectibleDesc, ConstructionRecipeDesc,
    CraftingRecipeDesc, DeconstructionRecipeDesc,
    DeployableDesc,
    EnemyDesc,
    EquipmentDesc,
    ExtractionRecipeDesc,
    FoodDesc,
    ItemConversionRecipeDesc,
    ItemDesc,
    ItemListDesc,
    ItemListPossibility,
    ItemStack,
    ItemType,
    KnowledgeScrollDesc,
    KnowledgeStatModifierDesc,
    ProbabilisticItemStack,
    ResourceDesc,
    SecondaryKnowledgeDesc,
    SkillDesc,
    ToolDesc,
    ToolTypeDesc,
    TravelerTaskDesc,
    TravelerTradeOrderDesc,
    WeaponDesc,
    WeaponTypeDesc
} from "~/bindings/ts";
import {Accessor, createMemo, createResource} from "solid-js";

interface FetchParams {
    name: string;
    itemType: AlgebraicType;
}

//const bsatnPath = "/json";
const bsatnPath = "/bsatn/server";

// function toCamelCase(obj: any): any {
//     if (Array.isArray(obj)) {
//         return obj.map(toCamelCase);
//     }
//
//     if (obj !== null && typeof obj === "object") {
//         return Object.entries(obj).reduce((acc, [key, value]) => {
//             const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
//             acc[camelKey] = toCamelCase(value);
//             return acc;
//         }, {} as any);
//     }
//
//     return obj;
// }

async function fetchBSATN<T>(params: FetchParams) {
    const data = await fetch(
        `${bsatnPath}/${params.name}.bsatn`//.json`
    );
    if (!data.ok) {
        throw Error("Couldn't fetch BSATN data." + await data.text())
    }
    //const res = await data.text();
    //return toCamelCase(JSON.parse(res)) as T[];
    const reader = new BinaryReader(new Uint8Array((await data.arrayBuffer())));
    return AlgebraicType.createArrayType(params.itemType).deserialize(reader) as T[];
}

function cachedTable<T>(base: BitCraftTable<T>) {
    const [resource] = createResource(
        async () => fetchBSATN<T>({
            name: base.st_name, itemType: base.st_type
        }),
        {name: base.st_name + 'Async'}
    );
    base.get = resource;
    return base;
}


function createIndex<TData, TIdx extends keyof TData & string, TValue extends TData[TIdx] & (string | number)>(
    tbl: Accessor<TData[] | undefined>, field: TIdx
): Accessor<Map<TValue, TData> | undefined> {
    return createMemo(() => {
        let map = new Map<TValue, TData>();
        if (!tbl()) {
            return undefined;
        }
        for (let item of tbl()!) {
            map.set(item[field] as TValue, item);
        }
        return map;
    });
}

export class BitCraftTable<TData> {
    st_name: string;
    st_type: AlgebraicType;
    get: Accessor<TData[] | undefined>;
    #idxCache: Map<string, Accessor<Map<any, TData> | undefined>>;
    #stacksContainingItem: Map<string, Accessor<[TData[], TData[]] | undefined>>; // key is (itemType.tag + "_" + (item.id || cargo.id))
    private readonly stackKeys: [(keyof TData)[], (keyof TData)[]];
    preload: boolean;

    constructor(st_name: string, st_type: AlgebraicType,
                itemStackKeys: [(keyof TData)[], (keyof TData)[]] = [[], []]) {
        this.st_name = st_name;
        this.st_type = st_type;
        this.preload = true;
        this.stackKeys = itemStackKeys;
        this.get = () => undefined;
        this.#idxCache = new Map<string, Accessor<Map<any, TData> | undefined>>();
        this.#stacksContainingItem = new Map<string, Accessor<[TData[], TData[]] | undefined>>();
    }

    indexedBy<TIdx extends string & keyof TData, TValue extends TData[TIdx] & (string | number)>(key: TIdx) {
        let res = this.#idxCache.get(key);
        if (!res) {
            res = createIndex<TData, TIdx, TValue>(this.get, key);
            if (!res()) return undefined;
            this.#idxCache.set(key, res)
        }
        return res;
    }

    findByItemStacks(itemId: number, itemType: string) {
        if (!this.stackKeys.length) {
            console.log("Tried to get items by stack for table that doesn't have stacks defined: " + this.st_name);
            return () => [[], []] as [TData[], TData[]];
        }
        const cacheKey = itemType + "_" + itemId;
        let res = this.#stacksContainingItem.get(cacheKey);
        if (!res) {
            res = createMemo(() => {
                if (!this.get()) return undefined;
                const inputHits: TData[] = [];
                const outputHits: TData[] = [];
                for (const container of this.get()!) {
                    let target = inputHits;
                    for (const stackKeyArray of this.stackKeys) {
                        for (const stackKey of stackKeyArray) {
                            // @ts-ignore - I don't know how to express `K = keyof<TData> & TData[K] extends ItemStack[]...`
                            // TODO this is terrible
                            let stacks: ItemStack | ItemStack[] | ProbabilisticItemStack[] | ItemListPossibility[] | number[] | number = container[stackKey];
                            if (typeof stacks === 'number') {
                                if (itemId === stacks && itemType == ItemType.Cargo.tag) {
                                    // TODO lol more assumptions. need some matcher type here per key instead of all these ifs
                                    target.push(container);
                                }
                                break;
                            }
                            if (!Array.isArray(stacks)) {
                                stacks = [stacks];
                            }
                            for (let stack of stacks) {
                                if (typeof stack === 'number') {
                                    // TODO assuming cargo right now due to traveler trades
                                    // see if anything else stores non-cargo items in this way
                                    if (itemId == stack && itemType == ItemType.Cargo.tag) {
                                        target.push(container);
                                        continue;
                                    }
                                } else if (Object.hasOwn(stack, 'items')) {
                                    const possibleStacks = (stack as ItemListPossibility).items;
                                    for (const i of possibleStacks) {
                                        if (i.itemId === itemId && i.itemType.tag === itemType) {
                                            target.push(container);
                                            break;
                                        }
                                    }
                                    continue;
                                } else if (Object.hasOwn(stack, 'probability')) {
                                    // ProbabilisticItemStack stores the actual stack in a child object
                                    let subStack = (stack as ProbabilisticItemStack).itemStack;
                                    if (!subStack) {
                                        continue;
                                    }
                                    stack = subStack;
                                }
                                stack = stack as ItemStack;
                                if (stack.itemId === itemId && stack.itemType.tag === itemType) {
                                    target.push(container);
                                }
                            }
                        }
                        target = outputHits;
                    }
                }
                return [inputHits, outputHits] as [TData[], TData[]];
            });
            if (typeof res() !== 'undefined') {
                this.#stacksContainingItem.set(cacheKey, res);
            }
        }
        return res;
    }
}

export const BitCraftTables = {
    'ItemDesc': cachedTable<ItemDesc>(
        new BitCraftTable('item_desc',
            ItemDesc.getTypeScriptAlgebraicType(),
        )),
    'CargoDesc': cachedTable<CargoDesc>(
        new BitCraftTable('cargo_desc',
            CargoDesc.getTypeScriptAlgebraicType(),
        )),
    'EnemyDesc': cachedTable<EnemyDesc>(
        new BitCraftTable('enemy_desc',
            EnemyDesc.getTypeScriptAlgebraicType()
        )),
    'ResourceDesc': cachedTable<ResourceDesc>(
        new BitCraftTable('resource_desc',
            ResourceDesc.getTypeScriptAlgebraicType(),
            [[], ['onDestroyYield']]
        )),
    'BuildingRepairsDesc': cachedTable<BuildingRepairsDesc>(
        new BitCraftTable('building_repairs_desc',
            BuildingRepairsDesc.getTypeScriptAlgebraicType()
        )),
    'BuildingDesc': cachedTable<BuildingDesc>(
        new BitCraftTable('building_desc',
            BuildingDesc.getTypeScriptAlgebraicType()
        )),
    'BuildingTypeDesc': cachedTable<BuildingTypeDesc>(
        new BitCraftTable('building_type_desc',
            BuildingTypeDesc.getTypeScriptAlgebraicType()
        )),
    'ConstructionRecipeDesc': cachedTable<ConstructionRecipeDesc>(
        new BitCraftTable('construction_recipe_desc',
            ConstructionRecipeDesc.getTypeScriptAlgebraicType(),
            [['consumedItemStacks', 'consumedCargoStacks'], []]
        )),
    'DeconstructionRecipeDesc': cachedTable<DeconstructionRecipeDesc>(
        new BitCraftTable('deconstruction_recipe_desc',
            DeconstructionRecipeDesc.getTypeScriptAlgebraicType(),
            [[], ['outputItemStacks', 'outputCargoId']]
        )),
    'CollectibleDesc': cachedTable<CollectibleDesc>(
        new BitCraftTable('collectible_desc',
            CollectibleDesc.getTypeScriptAlgebraicType()
        )),
    'DeployableDesc': cachedTable<DeployableDesc>(
        new BitCraftTable('deployable_desc',
            DeployableDesc.getTypeScriptAlgebraicType()
        )),
    'ClaimTechDesc': cachedTable<ClaimTechDesc>(
        new BitCraftTable('claim_tech_desc',
            ClaimTechDesc.getTypeScriptAlgebraicType()
        )),
    'TravelerTaskDesc': cachedTable<TravelerTaskDesc>(
        new BitCraftTable('traveler_task_desc',
            TravelerTaskDesc.getTypeScriptAlgebraicType(),
            [['requiredItems'], ['rewardedItems']]
        )),
    'TravelerTradeOrderDesc': cachedTable<TravelerTradeOrderDesc>(
        new BitCraftTable('traveler_trade_order_desc',
            TravelerTradeOrderDesc.getTypeScriptAlgebraicType(),
            [['requiredItems', 'requiredCargoId'], ['offerItems', 'offerCargoId']]
    )),
    'BiomeDesc': cachedTable<BiomeDesc>(
        new BitCraftTable('biome_desc',
            BiomeDesc.getTypeScriptAlgebraicType()
        )),
    'ItemListDesc': cachedTable<ItemListDesc>(
        new BitCraftTable('item_list_desc',
            ItemListDesc.getTypeScriptAlgebraicType(),
            [[], ['possibilities']]
        )),
    'CraftingRecipeDesc': cachedTable<CraftingRecipeDesc>(
        new BitCraftTable('crafting_recipe_desc',
            CraftingRecipeDesc.getTypeScriptAlgebraicType(),
            [['consumedItemStacks'], ['craftedItemStacks']]
        )),
    'ExtractionRecipeDesc': cachedTable<ExtractionRecipeDesc>(
        new BitCraftTable('extraction_recipe_desc',
            ExtractionRecipeDesc.getTypeScriptAlgebraicType(),
            [['cargoId', 'consumedItemStacks'], ['extractedItemStacks']]
        )),
    'ItemConversionRecipeDesc': cachedTable<ItemConversionRecipeDesc>(
        new BitCraftTable('item_conversion_recipe_desc',
            ItemConversionRecipeDesc.getTypeScriptAlgebraicType(),
            [['inputItems'], ['outputItem']]
        )),
    'WeaponDesc': cachedTable<WeaponDesc>(
        new BitCraftTable('weapon_desc',
            WeaponDesc.getTypeScriptAlgebraicType(),
        )),
    'WeaponTypeDesc': cachedTable<WeaponTypeDesc>(
        new BitCraftTable('weapon_type_desc',
            WeaponTypeDesc.getTypeScriptAlgebraicType(),
        )),
    'EquipmentDesc': cachedTable<EquipmentDesc>(
        new BitCraftTable('equipment_desc',
            EquipmentDesc.getTypeScriptAlgebraicType(),
        )),
    'ToolDesc': cachedTable<ToolDesc>(
        new BitCraftTable('tool_desc',
            ToolDesc.getTypeScriptAlgebraicType(),
        )),
    'ToolTypeDesc': cachedTable<ToolTypeDesc>(
        new BitCraftTable('tool_type_desc',
            ToolTypeDesc.getTypeScriptAlgebraicType(),
        )),
    'FoodDesc': cachedTable<FoodDesc>(
        new BitCraftTable('food_desc',
            FoodDesc.getTypeScriptAlgebraicType(),
        )),
    'BuffDesc': cachedTable<BuffDesc>(
        new BitCraftTable('buff_desc',
            BuffDesc.getTypeScriptAlgebraicType(),
        )),
    'SkillDesc': cachedTable<SkillDesc>(
        new BitCraftTable('skill_desc',
            SkillDesc.getTypeScriptAlgebraicType(),
        )),
    'KnowledgeScrollDesc': cachedTable<KnowledgeScrollDesc>(
        new BitCraftTable('knowledge_scroll_desc',
            KnowledgeScrollDesc.getTypeScriptAlgebraicType()
        )),
    'KnowledgeStatModifierDesc': cachedTable<KnowledgeStatModifierDesc>(
        new BitCraftTable('knowledge_stat_modifier_desc',
            KnowledgeStatModifierDesc.getTypeScriptAlgebraicType()
        )),
    'SecondaryKnowledgeDesc': cachedTable<SecondaryKnowledgeDesc>(
        new BitCraftTable('secondary_knowledge_desc',
            SecondaryKnowledgeDesc.getTypeScriptAlgebraicType()
        )),
};

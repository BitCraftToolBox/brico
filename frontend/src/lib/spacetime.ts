import {AlgebraicType, BinaryReader} from "@clockworklabs/spacetimedb-sdk";
import {Accessor, createMemo, createSignal} from "solid-js";
import {isServer} from "solid-js/web";
import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {BiomeDesc} from "~/bindings/src/biome_desc_type";
import {BuffDesc} from "~/bindings/src/buff_desc_type";
import {BuffTypeDesc} from "~/bindings/src/buff_type_desc_type";
import {BuildingBuffDesc} from "~/bindings/src/building_buff_desc_type";
import {BuildingDesc} from "~/bindings/src/building_desc_type";
import {BuildingRepairsDesc} from "~/bindings/src/building_repairs_desc_type";
import {BuildingTypeDesc} from "~/bindings/src/building_type_desc_type";
import {CargoDesc} from "~/bindings/src/cargo_desc_type";
import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {ConstructionRecipeDesc} from "~/bindings/src/construction_recipe_desc_type";
import {ContributionLootDesc} from "~/bindings/src/contribution_loot_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {DeployableAppearanceOverrideDesc} from "~/bindings/src/deployable_appearance_override_desc_type";
import {DeployableDesc} from "~/bindings/src/deployable_desc_type";
import {EnemyAiParamsDesc} from "~/bindings/src/enemy_ai_params_desc_type";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {EnemyScalingDesc} from "~/bindings/src/enemy_scaling_desc_type";
import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {FoodDesc} from "~/bindings/src/food_desc_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {KnowledgeScrollDesc} from "~/bindings/src/knowledge_scroll_desc_type";
import {KnowledgeStatModifierDesc} from "~/bindings/src/knowledge_stat_modifier_desc_type";
import {NpcDesc} from "~/bindings/src/npc_desc_type";
import {PathfindingDesc} from "~/bindings/src/pathfinding_desc_type";
import {PavingTileDesc} from "~/bindings/src/paving_tile_desc_type";
import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import {PlaceableGroupDesc} from "~/bindings/src/placeable_group_desc_type";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {QuestDropDesc} from "~/bindings/src/quest_drop_desc_type";
import {QuestStageDesc} from "~/bindings/src/quest_stage_desc_type";
import {ResourceClumpDesc} from "~/bindings/src/resource_clump_desc_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {ResourceGrowthRecipeDesc} from "~/bindings/src/resource_growth_recipe_desc_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {SkillDesc} from "~/bindings/src/skill_desc_type";
import {StageRewardsDesc} from "~/bindings/src/stage_rewards_desc_type";
import {TerraformRecipeDesc} from "~/bindings/src/terraform_recipe_desc_type";
import {ToolDesc} from "~/bindings/src/tool_desc_type";
import {ToolTypeDesc} from "~/bindings/src/tool_type_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {WeaponDesc} from "~/bindings/src/weapon_desc_type";
import {WeaponTypeDesc} from "~/bindings/src/weapon_type_desc_type";
import {CURRENT_VERSION} from "~/lib/version";

interface FetchParams {
    name: string;
    itemType: AlgebraicType;
}

const bsatnPath = "/bsatn/static";

/**
 * Fetch + deserialize one BSATN table array from `${baseUrl}/<name>.bsatn`.
 * `baseUrl` is the relative static path on the client and an absolute origin-qualified
 * path on the server (the Workers runtime has no ambient origin for relative fetch).
 * A version query busts caches on deploy so the files can be served immutably.
 */
async function fetchBSATNFrom<T>(baseUrl: string, params: FetchParams): Promise<T[]> {
    const data = await fetch(`${baseUrl}/${params.name}.bsatn?v=${encodeURIComponent(CURRENT_VERSION.tag)}`);
    if (!data.ok) {
        throw Error("Couldn't fetch BSATN data." + await data.text());
    }
    const reader = new BinaryReader(new Uint8Array(await data.arrayBuffer()));
    return AlgebraicType.createArrayType(params.itemType).deserialize(reader) as T[];
}

// ── Dual-mode table store ─────────────────────────────────────
// Every constructed table registers here so the server/client preloads can populate them.
const allTables: BitCraftTable<any>[] = [];

// Server: successfully parsed tables are memoized per isolate (shared across requests on a warm
// isolate). Only successes are cached — a failed fetch is retried on the next request so a
// transient error (e.g. an asset layer not yet ready) never permanently poisons the isolate.
const serverCache = new Map<string, any[]>();


function cache<T>(n: string, b: { getTypeScriptAlgebraicType: () => AlgebraicType }) {
    return new BitCraftTable<T>(n, b.getTypeScriptAlgebraicType());
}


function createIndex<TData, TIdx extends keyof TData & string, TValue extends TData[TIdx] & (string | number)>(
    tbl: Accessor<TData[] | undefined>, field: TIdx, allowZero: boolean
): Accessor<Map<TValue, TData>> {
    return createMemo(() => {
        const data = tbl() ?? [];
        const map = new Map<TValue, TData>();
        for (const item of data) {
            const key = item[field] as TValue;
            if (key !== null && (allowZero || key !== 0)) map.set(key, item);
        }
        return map;
    });
}

function createIndexMulti<TData, TIdx extends keyof TData & string, TValue extends TData[TIdx] & (string | number)>(
    tbl: Accessor<TData[] | undefined>, field: TIdx, allowZero: boolean
): Accessor<Map<TValue, TData[]>> {
    return createMemo(() => {
        const data = tbl() ?? [];
        const map = new Map<TValue, TData[]>();
        for (const item of data) {
            const key = item[field] as TValue;
            if (key !== null && (allowZero || key !== 0)) {
                let existing = map.get(key);
                if (existing) {
                    existing.push(item);
                } else {
                    existing = [item];
                    map.set(key, existing);
                }
            }
        }
        return map;
    });
}

export function loadTableAdHoc<T>(n: string, b: { getTypeScriptAlgebraicType: () => AlgebraicType }) {
    const table = cache<T>(n, b);
    // Ad-hoc tables are typically created after the bulk preload (e.g. inside a lazily
    // imported route module), so kick off their own client load immediately.
    if (!isServer) void table.ensureClientLoaded();
    return table;
}

export class BitCraftTable<TData> {
    spacetimeName: string;
    spacetimeType: AlgebraicType;
    get: Accessor<TData[] | undefined>;
    loading: Accessor<boolean>;
    error: Accessor<any>;
    #setData?: (d: TData[]) => void;
    #setError?: (e: any) => void;
    #clientLoad?: Promise<void>;
    #serverLoad?: Promise<void>;
    #idxCache: Map<string, Accessor<Map<any, TData>>>;
    #idxCacheMulti: Map<string, Accessor<Map<any, TData[]>>>;
    #tagOrdinalCache: Map<string, Map<string, number>>;

    constructor(spacetimeName: string, spacetimeType: AlgebraicType) {
        this.spacetimeName = spacetimeName;
        this.spacetimeType = spacetimeType;
        if (isServer) {
            // Reads from the per-isolate memo, populated by preloadAllTablesServer().
            this.get = () => serverCache.get(spacetimeName) as TData[] | undefined;
            this.loading = () => !serverCache.has(spacetimeName);
            this.error = () => undefined;
        } else {
            // Reactive signal, populated by ensureClientLoaded() / preloadAllTablesClient().
            const [data, setData] = createSignal<TData[] | undefined>(undefined);
            const [error, setError] = createSignal<any>(undefined);
            this.get = data;
            this.loading = () => data() === undefined && error() === undefined;
            this.error = error;
            this.#setData = setData;
            this.#setError = setError;
        }
        this.#idxCache = new Map<string, Accessor<Map<any, TData>>>();
        this.#idxCacheMulti = new Map<string, Accessor<Map<any, TData[]>>>();
        this.#tagOrdinalCache = new Map<string, Map<string, number>>();
        allTables.push(this);
    }

    /** Client: fetch + populate this table's signal exactly once. */
    ensureClientLoaded(): Promise<void> {
        if (isServer) return Promise.resolve();
        if (!this.#clientLoad) {
            this.#clientLoad = fetchBSATNFrom<TData>(bsatnPath, {name: this.spacetimeName, itemType: this.spacetimeType})
                .then(d => this.#setData!(d))
                .catch(e => this.#setError!(e));
        }
        return this.#clientLoad;
    }

    /**
     * Server: fetch + memoize this table in the per-isolate cache. Successes are cached
     * permanently; a failure clears the in-flight promise so the next request retries.
     * Concurrent requests share a single in-flight fetch.
     */
    ensureServerLoaded(baseUrl: string): Promise<void> {
        if (serverCache.has(this.spacetimeName)) return Promise.resolve();
        if (!this.#serverLoad) {
            this.#serverLoad = fetchBSATNFrom<TData>(baseUrl, {name: this.spacetimeName, itemType: this.spacetimeType})
                .then(d => {
                    serverCache.set(this.spacetimeName, d);
                })
                .catch(e => {
                    console.error(`[spacetime] failed to load ${this.spacetimeName}:`, e);
                })
                .finally(() => {
                    this.#serverLoad = undefined;
                });
        }
        return this.#serverLoad;
    }

    indexedBy<TIdx extends string & keyof TData, TValue extends TData[TIdx] & (string | number)>(key: TIdx, allowZero: boolean = false): Accessor<Map<any, TData>> {
        let res = this.#idxCache.get(key);
        if (!res) {
            res = createIndex<TData, TIdx, TValue>(this.get, key, allowZero);
            this.#idxCache.set(key, res)
        }
        return res;
    }

    indexedByMulti<TIdx extends string & keyof TData, TValue extends TData[TIdx] & (string | number)>(key: TIdx, allowZero: boolean = false): Accessor<Map<any, TData[]>> {
        let res = this.#idxCacheMulti.get(key);
        if (!res) {
            res = createIndexMulti<TData, TIdx, TValue>(this.get, key, allowZero);
            this.#idxCacheMulti.set(key, res)
        }
        return res;
    }

    /**
     * Reflects on the AlgebraicType for a sum-typed field and returns a memoized
     * Map<tagName, ordinalIndex>. Use this to convert a tagged-union value (e.g.
     * `{ tag: "GrassBird" }`) into the numeric ordinal used as a primary key in
     * another table (e.g. `EnemyDesc.enemyType`).
     */
    tagToOrdinal(field: string & keyof TData): Map<string, number> {
        const cached = this.#tagOrdinalCache.get(field);
        if (cached) return cached;

        const elements: any[] = (this.spacetimeType as any).product?.elements ?? [];
        const elem = elements.find((e: any) => e.name === field);
        if (!elem) {
            throw new Error(`[BitCraftTable] Field '${field}' not found in type '${this.spacetimeName}'`);
        }
        const rootType: AlgebraicType = elem.algebraicType;
        const variants: any[] = rootType.type == "ArrayType" ? rootType.array.sum.variants : rootType.sum.variants;
        const map = new Map<string, number>();
        variants.forEach((v: any, i: number) => map.set(v.name, i));
        this.#tagOrdinalCache.set(field, map);
        return map;
    }
}

export const BitCraftTables = {
    'ItemDesc': cache<ItemDesc>('item_desc', ItemDesc),
    'CargoDesc': cache<CargoDesc>('cargo_desc', CargoDesc),
    'EnemyDesc': cache<EnemyDesc>('enemy_desc', EnemyDesc),
    'ResourceDesc': cache<ResourceDesc>('resource_desc', ResourceDesc),
    'BuildingRepairsDesc': cache<BuildingRepairsDesc>('building_repairs_desc', BuildingRepairsDesc),
    'BuildingBuffDesc': cache<BuildingBuffDesc>('building_buff_desc', BuildingBuffDesc),
    'BuildingDesc': cache<BuildingDesc>('building_desc', BuildingDesc),
    'BuildingTypeDesc': cache<BuildingTypeDesc>('building_type_desc', BuildingTypeDesc),
    'ConstructionRecipeDesc': cache<ConstructionRecipeDesc>('construction_recipe_desc', ConstructionRecipeDesc),
    'DeconstructionRecipeDesc': cache<DeconstructionRecipeDesc>('deconstruction_recipe_desc', DeconstructionRecipeDesc),
    'CollectibleDesc': cache<CollectibleDesc>('collectible_desc', CollectibleDesc),
    'DeployableDesc': cache<DeployableDesc>('deployable_desc', DeployableDesc),
    'ClaimTechDesc': cache<ClaimTechDesc>('claim_tech_desc', ClaimTechDesc),
    'TravelerTaskDesc': cache<TravelerTaskDesc>('traveler_task_desc', TravelerTaskDesc),
    'TravelerTradeOrderDesc': cache<TravelerTradeOrderDesc>('traveler_trade_order_desc', TravelerTradeOrderDesc),
    'BiomeDesc': cache<BiomeDesc>('biome_desc', BiomeDesc),
    'ItemListDesc': cache<ItemListDesc>('item_list_desc', ItemListDesc),
    'CraftingRecipeDesc': cache<CraftingRecipeDesc>('crafting_recipe_desc', CraftingRecipeDesc),
    'ExtractionRecipeDesc': cache<ExtractionRecipeDesc>('extraction_recipe_desc', ExtractionRecipeDesc),
    'ItemConversionRecipeDesc': cache<ItemConversionRecipeDesc>('item_conversion_recipe_desc', ItemConversionRecipeDesc),
    'WeaponDesc': cache<WeaponDesc>('weapon_desc', WeaponDesc),
    'WeaponTypeDesc': cache<WeaponTypeDesc>('weapon_type_desc', WeaponTypeDesc),
    'EquipmentDesc': cache<EquipmentDesc>('equipment_desc', EquipmentDesc),
    'ToolDesc': cache<ToolDesc>('tool_desc', ToolDesc),
    'ToolTypeDesc': cache<ToolTypeDesc>('tool_type_desc', ToolTypeDesc),
    'FoodDesc': cache<FoodDesc>('food_desc', FoodDesc),
    'BuffDesc': cache<BuffDesc>('buff_desc', BuffDesc),
    'SkillDesc': cache<SkillDesc>('skill_desc', SkillDesc),
    'KnowledgeScrollDesc': cache<KnowledgeScrollDesc>('knowledge_scroll_desc', KnowledgeScrollDesc),
    'KnowledgeStatModifierDesc': cache<KnowledgeStatModifierDesc>('knowledge_stat_modifier_desc', KnowledgeStatModifierDesc),
    'SecondaryKnowledgeDesc': cache<SecondaryKnowledgeDesc>('secondary_knowledge_desc', SecondaryKnowledgeDesc),
    'PathfindingDesc': cache<PathfindingDesc>('pathfinding_desc', PathfindingDesc),
    'AchievementDesc': cache<AchievementDesc>('achievement_desc', AchievementDesc),
    'ProspectingDesc': cache<ProspectingDesc>('prospecting_desc', ProspectingDesc),
    'CombatActionDesc': cache<CombatActionDesc>('combat_action_desc', CombatActionDesc),
    'PavingTileDesc': cache<PavingTileDesc>('paving_tile_desc', PavingTileDesc),
    'ResourceClumpDesc': cache<ResourceClumpDesc>('resource_clump_desc', ResourceClumpDesc),
    'EnemyAiParamsDesc': cache<EnemyAiParamsDesc>('enemy_ai_params_desc', EnemyAiParamsDesc),
    'ContributionLootDesc': cache<ContributionLootDesc>('contribution_loot_desc', ContributionLootDesc),
    'QuestDropDesc': cache<QuestDropDesc>('quest_drop_desc', QuestDropDesc),
    'QuestChainDesc': cache<QuestChainDesc>('quest_chain_desc', QuestChainDesc),
    'StageRewardsDesc': cache<StageRewardsDesc>('stage_rewards_desc', StageRewardsDesc),
    'BuffTypeDesc': cache<BuffTypeDesc>('buff_type_desc', BuffTypeDesc),
    'QuestStageDesc': cache<QuestStageDesc>('quest_stage_desc', QuestStageDesc),
    'PlaceableDesc': cache<PlaceableDesc>('placeable_desc', PlaceableDesc),
    'PlaceableGroupDesc': cache<PlaceableGroupDesc>('placeable_group_desc', PlaceableGroupDesc),
    'PlaceableGrowthDesc': cache<PlaceableGrowthDesc>('placeable_growth_desc', PlaceableGrowthDesc),
    'PlaceableInteractionDesc': cache<PlaceableInteractionDesc>('placeable_interaction_desc', PlaceableInteractionDesc),
    'PlaceablePlacementDesc': cache<PlaceablePlacementDesc>('placeable_placement_desc', PlaceablePlacementDesc),
    'NpcDesc': cache<NpcDesc>('npc_desc', NpcDesc),
    'DeployableAppearanceOverrideDesc': cache<DeployableAppearanceOverrideDesc>('deployable_appearance_override_desc', DeployableAppearanceOverrideDesc),
    'EnemyScalingDesc': cache<EnemyScalingDesc>('enemy_scaling_desc', EnemyScalingDesc),
    'ResourceGrowthRecipeDesc': cache<ResourceGrowthRecipeDesc>('resource_growth_recipe_desc', ResourceGrowthRecipeDesc),
    'TerraformRecipeDesc': cache<TerraformRecipeDesc>('terraform_recipe_desc', TerraformRecipeDesc),
};

// ── Preloads ──────────────────────────────────────────────────

/**
 * Server: ensure every registered table is fetched + parsed for this isolate. Cheap once warm
 * (cached tables short-circuit); previously-failed tables are retried. `origin` is the request
 * origin (e.g. https://brico.app) used to build absolute asset URLs.
 */
export async function preloadAllTablesServer(origin: string): Promise<void> {
    const baseUrl = `${origin}${bsatnPath}`;
    await Promise.all(allTables.map(t => t.ensureServerLoaded(baseUrl)));
}

let clientPreload: Promise<void> | undefined;

/**
 * Client: fetch + parse every registered table once, populating the reactive store. Awaited in
 * entry-client before hydration so the first client render matches the server-rendered HTML.
 */
export function preloadAllTablesClient(): Promise<void> {
    if (!clientPreload) {
        clientPreload = Promise.all(allTables.map(t => t.ensureClientLoaded())).then(() => {});
    }
    return clientPreload;
}

/**
 * Returns true when ALL game tables have finished loading (regardless of success/failure).
 */
export function useGameDataReady(): Accessor<boolean> {
    return createMemo(() =>
        Object.values(BitCraftTables).every(t => !t.loading())
    );
}

/**
 * Returns the number of tables that have finished loading and the total table count.
 * Useful for showing a progress bar during initial load.
 */
export function useLoadingProgress(): Accessor<{ loaded: number; total: number }> {
    const tables = Object.values(BitCraftTables);
    return createMemo(() => ({
        loaded: tables.filter(t => !t.loading()).length,
        total: tables.length,
    }));
}

/**
 * Returns true if ANY of the specified tables are still loading.
 * Useful for detail pages that depend on multiple tables.
 */
export function useTablesLoading(...tables: BitCraftTable<any>[]): Accessor<boolean> {
    return createMemo(() => tables.some(t => t.loading()));
}


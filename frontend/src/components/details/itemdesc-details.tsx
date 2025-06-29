import {
    CappedLevelRequirement,
    CargoDesc,
    ConstructionRecipeDesc,
    CraftingRecipeDesc,
    DeconstructionRecipeDesc,
    ExperienceStackF32,
    ExtractionRecipeDesc,
    InputItemStack,
    ItemConversionRecipeDesc,
    ItemDesc,
    ItemListDesc,
    ItemStack,
    ItemType,
    LevelRequirement,
    ProbabilisticItemStack,
    SkillDesc,
    ToolRequirement,
    ToolTypeDesc,
    TravelerTaskDesc,
    TravelerTradeOrderDesc
} from "~/bindings/ts";
import {Accessor, Component, createSignal, For, JSX, Setter, Show} from "solid-js";
import {BitCraftTables} from "~/lib/spacetime";
import {TbArrowBigDownLines as IconDown} from "solid-icons/tb";
import {Card, CardContent, CardHeader, CardTitle} from "~/components/ui/card";
import {fixFloat, splitCamelCase} from "~/lib/utils";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {expandStack, ItemIcon, ItemStackArrayComponent, ItemStackIconProps} from "~/components/bitcraft/items";
import {TierIcon} from "~/components/bitcraft/misc";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {getRecipeMaps} from "~/lib/recipes";
import {ResourceIcon} from "~/components/bitcraft/resources";
import {BuildingIcon} from "~/components/bitcraft/buildings";


type ItemCardProps = {
    item: ItemDesc | CargoDesc
    itemType: string
}

const StatCard: Component<ItemCardProps> = (props) => {
    const item = props.item;

    const toolIndex = BitCraftTables.ToolDesc.indexedBy("itemId");
    const equipIndex = BitCraftTables.EquipmentDesc.indexedBy("itemId");
    const foodIndex = BitCraftTables.FoodDesc.indexedBy("itemId");
    const weaponIndex = BitCraftTables.WeaponDesc.indexedBy("itemId");
    const toolTypeIndex = BitCraftTables.ToolTypeDesc.indexedBy("id");
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");
    const knowledgeScrollIndex = BitCraftTables.KnowledgeScrollDesc.indexedBy("itemId");
    const knowledgeStatIndex = BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId");

    const toolData = toolIndex && toolIndex()?.get(item.id);
    const equipData = equipIndex && equipIndex()?.get(item.id);
    const foodData = foodIndex && foodIndex()?.get(item.id);
    const weaponData = weaponIndex && weaponIndex()?.get(item.id);
    const toolTypeData = toolData && toolTypeIndex && toolTypeIndex()?.get(toolData.toolType);
    const knowledgeScrollData = props.itemType == ItemType.Item.tag
    && knowledgeScrollIndex ? knowledgeScrollIndex()?.get(item.id) : undefined;
    const secondaryKnowledgeId = knowledgeScrollData ? knowledgeScrollData.secondaryKnowledgeId : undefined;
    const knowledgeStatData = secondaryKnowledgeId && knowledgeStatIndex && knowledgeScrollData
        ? knowledgeStatIndex()?.get(knowledgeScrollData.secondaryKnowledgeId) : undefined;
    const knowledgeStatDataStats = knowledgeStatData && knowledgeStatData.stats;

    return <Show when={toolData || equipData || weaponData || foodData || knowledgeStatData}>
        <Card>
            <CardHeader>
                <CardTitle class="w-full text-center">Stats</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="flex flex-row flex-wrap justify-around">
                    <Show when={toolData}>
                        <div class="flex flex-col px-2">
                            <p>Type: {toolTypeData!.name}</p>
                            <p>Power: {toolData!.power}</p>
                            <p>Skill: {skillIndex!()?.get(toolTypeData!.skillId)?.name} {toolData!.level}</p>
                        </div>
                    </Show>
                    <Show when={equipData || weaponData}>
                        <Show when={equipData}>
                            <div class="flex flex-col px-2">
                                <p>Type: {equipData!.slots.map((s: any) => s.tag).join(", ")}</p>
                                <p>Requirement: {skillIndex!()!.get(equipData!.levelRequirement?.skillId)!.name} {equipData!.levelRequirement?.level}</p>
                            </div>
                        </Show>
                        <Show when={equipData?.stats.length || weaponData}>
                            <div class="flex flex-col px-2">
                                <For each={equipData?.stats}>
                                    {stat =>
                                        <p>{splitCamelCase(stat.id.tag)} {fixFloat(stat.value * (stat.isPct ? 100 : 1))}{stat.isPct ? "%" : ""}</p>}
                                </For>
                                <Show when={weaponData}>
                                    <p>Damage: {weaponData!.minDamage} - {weaponData!.maxDamage}</p>
                                    <p>Cooldown: {fixFloat(weaponData!.cooldown)}</p>
                                    <p>Stamina Use: {fixFloat(weaponData!.staminaUseMultiplier)}x</p>
                                </Show>
                            </div>
                        </Show>
                    </Show>
                    <Show when={foodData}>
                        <div class="flex flex-col px-2">
                            {foodData!.hunger && <p>Satiation: {foodData!.hunger}</p>}
                            {foodData!.hp && <p>HP: {foodData!.hp}</p>}
                            {foodData!.upToHp && <p>Up to HP: {foodData!.upToHp}</p>}
                            {foodData!.stamina && <p>Stamina: {foodData!.stamina}</p>}
                            {foodData!.upToStamina && <p>Up to Stamina: {foodData!.upToStamina}</p>}
                            {foodData!.teleportationEnergy &&
                                <p>Teleportation Energy: {foodData!.teleportationEnergy}</p>}
                            <For each={foodData!.buffs}>
                                {buff => {
                                    const buffData = buffIndex!()!.get(buff.buffId);
                                    if (!buffData) return <></>;
                                    return (
                                        <>
                                            <div>{buffData?.description} {buff.duration && (buff.duration / 60 + "m")}</div>
                                            <ul class="pl-4">
                                                <For each={buffData.stats}>
                                                    {stat =>
                                                        <li>{splitCamelCase(stat.id.tag)} {fixFloat(stat.value * (stat.isPct ? 100 : 1))}{stat.isPct ? "%" : ""}</li>}
                                                </For>
                                            </ul>
                                        </>
                                    )
                                }}
                            </For>
                        </div>
                    </Show>
                    <Show when={knowledgeStatDataStats?.length}>
                        <div class="flex flex-col px-2">
                            <ul class="pl-4">
                                <For each={knowledgeStatDataStats}>
                                    {stat =>
                                        <li>{splitCamelCase(stat.id.tag)} {fixFloat(stat.value * (stat.isPct ? 100 : 1))}{stat.isPct ? "%" : ""}</li>}
                                </For>
                            </ul>
                        </div>
                    </Show>
                </div>
            </CardContent>
        </Card>
    </Show>;
}

type RecipePanelProps<T> = {
    recipe: T
    tabValue: string
    getInputs: (recipe: T) => JSX.Element
    getOutputStacks?: (recipe: T) => ItemStack[] | ProbabilisticItemStack[] | ItemListDesc[]
    getOutputs?: (recipe: T) => JSX.Element
    getStatlines: (recipe: T) => [JSX.Element, JSX.Element][]
    maskedProbabilities?: boolean
    chances?: number
}

function RecipePanel<T>(props: RecipePanelProps<T>) {
    return (
        <TabsContent class="mt-8" value={props.tabValue}>
            <div class="flex flex-col min-w-1/2 justify-center">
                <div class="grid grid-flow-col grid-rows-1 justify-center">
                    {props.getInputs(props.recipe)}
                </div>
                <div class="flex flex-row justify-center">
                    <IconDown class="w-8 h-8 my-2"/>
                </div>
                <div class="grid grid-flow-col grid-rows-1 justify-center">
                    <Show when={props.getOutputs}
                          fallback={
                              <For each={props.getOutputStacks!(props.recipe)} fallback={"No Outputs"}>
                                  {stack => expandStack(stack, props.maskedProbabilities, props.chances)}
                              </For>
                          }
                    >
                        {props.getOutputs!(props.recipe)}
                    </Show>
                </div>
                <div class="flex flex-col items-center mt-4">
                    <For each={props.getStatlines(props.recipe)}>
                        {pair => <div class="flex flex-row w-full max-w-100">
                            <div class="text-nowrap mr-2">{pair[0]}</div>
                            <div class="dots-before flex flex-1 text-nowrap">{pair[1]}</div>
                        </div>}
                    </For>
                </div>
            </div>
        </TabsContent>
    )
}

type RecipesPanelProps = {
    value: Accessor<Option>,
    setValue: Setter<Option>,
    options: Option[]
    recipeMap: Map<number, [string, CraftingRecipeDesc]>,
    extractionMap: Map<number, [string, ExtractionRecipeDesc]>
    additionalMap?: Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][]]>
}

type Option = {
    label: string,
    value: string
}

function skillReqPair(req: LevelRequirement, skillData: Map<any, SkillDesc>) {
    let skillTag: string = skillData.get(req.skillId)?.skillCategory.tag ?? "";
    if (!skillTag || skillTag === "None") return null;
    if (skillTag === "Adventure") skillTag = "Skill";
    return [
        skillTag + ":",
        `Lv. ${req.level} ${skillData.get(req.skillId)?.name}`
    ] as [JSX.Element, JSX.Element];
}

function toolReqPair(req: ToolRequirement, toolData: Map<any, ToolTypeDesc>) {
    const tool = toolData.get(req.toolType);
    if (!tool) return null;
    return [
        "Tool:",
        <>
            Tier <TierIcon tier={req.level} class="mx-1 self-center"/>
            {tool.name}
            <Show when={req.power > 1}>
                {"(Power >= "}{req.power}{")"}
            </Show>
        </>
    ] as [JSX.Element, JSX.Element];
}

const RecipesPanel: Component<RecipesPanelProps> = (props) => {
    const resourceData = BitCraftTables.ResourceDesc.indexedBy("id")!()!;
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")!()!;
    const buildingData = BitCraftTables.BuildingTypeDesc.indexedBy("id")!()!;
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")!()!;

    const optionValues = props.options.map((opt) => opt.value);

    return <>
        <Select
            value={props.value()}
            onChange={props.setValue}
            options={props.options}
            optionValue="value"
            optionTextValue="label"
            placeholder="Select an option"
            itemComponent={(props) => (
                <SelectItem item={props.item}>{props.item.textValue}</SelectItem>
            )}
        >
            <SelectTrigger aria-label="Acquisition/Usage option">
                <SelectValue<Option> class="flex flex-row w-full max-w-[450px]">{(state) => {
                    return (
                        <>
                            <div class="text-balance">{state.selectedOption()?.label}</div>
                            <span class="ml-auto pl-2 mr-2 place-self-center">
                                {optionValues.indexOf(state.selectedOption()?.value) + 1}/{props.options.length}
                            </span>
                        </>
                    )
                }}</SelectValue>
            </SelectTrigger>
            <SelectContent class="max-h-100 overflow-y-auto"/>
        </Select>
        <Tabs defaultValue={optionValues[0]} value={props.value()?.value}>
            <For each={props.recipeMap.entries().toArray()}>
                {recipeKey => {
                    const [_, recipe] = recipeKey[1];
                    const recipeValue = "craft_" + recipe.id;
                    return <RecipePanel<CraftingRecipeDesc>
                        tabValue={recipeValue}
                        recipe={recipe}
                        getInputs={(r) =>
                            <ItemStackArrayComponent
                                stackProps={() => r.consumedItemStacks.map((s: InputItemStack) => {
                                    return {item: [s.itemType.tag, s.itemId], quantity: s.quantity}
                                })}
                            />
                        }
                        getOutputStacks={(r) => r.craftedItemStacks}
                        getStatlines={(r) => {
                            return [
                                ["Effort:", r.actionsRequired],
                                ["Time:", fixFloat(r.timeRequirement)],
                                ["Stamina:", fixFloat(r.staminaRequirement)],
                                ...r.levelRequirements.map((s: any) => skillReqPair(s, skillData)).filter((p: any) => !!p && p.length),
                                ...r.toolRequirements.map((r: any) => toolReqPair(r, toolData)).filter((p: any) => !!p && p.length),
                                ...(r.buildingRequirement ? [[
                                    "Building:",
                                    <>
                                        Tier <TierIcon tier={(r as CraftingRecipeDesc).buildingRequirement!.tier}
                                                       class="mx-1 self-center"/>
                                        {buildingData.get((r as CraftingRecipeDesc).buildingRequirement!.buildingType)?.name}
                                    </>
                                ]] : [])
                            ] as [JSX.Element, JSX.Element][]
                        }}
                    />;
                }}
            </For>
            <For each={props.extractionMap.entries().toArray()}>
                {extractionKey => {
                    const [_, extraction] = extractionKey[1];
                    const extractionValue = "extraction_" + extraction.id;
                    return (
                        <RecipePanel<ExtractionRecipeDesc>
                            recipe={extraction}
                            tabValue={extractionValue}
                            getInputs={(r) =>
                                <>
                                    <ItemStackArrayComponent
                                        stackProps={() => r.consumedItemStacks.map((s: InputItemStack) => {
                                            return {item: [s.itemType.tag, s.itemId], quantity: s.quantity}
                                        })}
                                    />
                                    <Show when={r.resourceId}>
                                        <div class="self-start"><ResourceIcon res={extraction.resourceId}/></div>
                                    </Show>
                                    <Show when={r.cargoId}>
                                        <ItemIcon item={[ItemType.Cargo.tag, r.cargoId]}/>
                                    </Show>
                                </>
                            }
                            getOutputStacks={(r) => r.extractedItemStacks
                                .map((p: ProbabilisticItemStack) => p).filter((s: ProbabilisticItemStack) => !!s)}
                            getStatlines={(r) => {
                                const stats: [JSX.Element, JSX.Element][] = [];
                                const res = resourceData.get(r.resourceId);
                                if (res) {
                                    stats.push(["Total HP", res.maxHealth]);
                                }
                                stats.push(["Time:", fixFloat(r.timeRequirement)]);
                                stats.push(["Stamina:", fixFloat(r.staminaRequirement)])
                                stats.push(...r.levelRequirements.map((req) => skillReqPair(req, skillData)).filter(p => !!p))
                                stats.push(...r.toolRequirements.map((req) => toolReqPair(req, toolData)).filter(p => !!p))
                                return stats;
                            }}
                            maskedProbabilities={extraction.verbPhrase === "Loot"}
                            chances={extraction.resourceId ? BitCraftTables.ResourceDesc.indexedBy("id")!()!.get(extraction.resourceId)!.maxHealth : undefined}
                        />
                    )
                }}
            </For>
            <For each={props.additionalMap?.entries().toArray()}>
                {(additionalKey) => {
                    const [tabValue, additionalRecipe] = additionalKey;
                    const getOutputs = typeof additionalRecipe[2] === 'function'
                        ? additionalRecipe[2] as (r: typeof additionalRecipe) => JSX.Element
                        : undefined;
                    const getOutputStacks = typeof additionalRecipe[2] !== 'function'
                        ? (r: typeof additionalRecipe) => r[2] as Exclude<OutputStacks, (r: typeof additionalRecipe) => JSX.Element>
                        : undefined;
                    return (
                        <RecipePanel<typeof additionalRecipe>
                            recipe={additionalRecipe}
                            tabValue={tabValue}
                            getInputs={(r) => r[1]}
                            getStatlines={(r) => r[3]}
                            getOutputs={getOutputs}
                            getOutputStacks={getOutputStacks}
                        />
                    )
                }}
            </For>
        </Tabs>
    </>
}

type OutputStacks = ItemStack[] | ProbabilisticItemStack[] | ItemListDesc[] | ((r: any) => JSX.Element);

function collapseCargoIds(cargo: number[]) {
    const uniqueCargo = new Set(cargo);
    return uniqueCargo.values().map(unique => {
        // TODO probably make this not O(n^2) not that it matters
        return {
            itemId: unique,
            itemType: ItemType.Cargo as ItemType,
            quantity: cargo.filter(ci => ci == unique).length,
        } as ItemStack
    }).toArray();
}

function collapseStacks(stacks: ItemStack[]) {
    const cargoMap = new Map<number, ItemStack>();
    const itemMap = new Map<number, ItemStack>();
    for (let stack of stacks) {
        let targetMap = stack.itemType.tag == ItemType.Cargo.tag ? cargoMap : itemMap;
        if (targetMap.has(stack.itemId)) {
            targetMap.get(stack.itemId)!.quantity += stack.quantity;
        } else {
            targetMap.set(stack.itemId, {
                itemId: stack.itemId,
                quantity: stack.quantity,
                itemType: stack.itemType,
                durability: stack.durability
            } as ItemStack)
        }
    }
    return [...cargoMap.values(), ...itemMap.values()];
}

function addTradeToMap(
    trade: TravelerTradeOrderDesc,
    map: Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][]]>,
    skillData: Map<any, SkillDesc>
) {
    const inputs = [...trade.requiredItems];
    if (trade.requiredCargoId.length) {
        inputs.push(...collapseCargoIds(trade.requiredCargoId));
    }
    const outputs = [...trade.offerItems];
    if (trade.offerCargoId.length) {
        outputs.push(...collapseCargoIds(trade.offerCargoId));
    }
    const stats = [
        ["Traveler:", trade.traveler.tag] as [string, string],
        ...trade.levelRequirements.map(req => skillReqPair(req, skillData)).filter(p => !!p),
    ];
    map.set(
        "travelerTrade_" + trade.id,
        [
            trade.traveler.tag + " Trade",
            <ItemStackArrayComponent stacks={() => inputs}/>,
            () => <ItemStackArrayComponent stacks={() => outputs} showName={true}/>,
            stats
        ]
    );
}

const RecipesCard: Component<ItemCardProps> = (props) => {
    const item = props.item;

    const recipeMaps = getRecipeMaps(item, props.itemType);
    const conversionsIndex = BitCraftTables.ItemConversionRecipeDesc.findByItemStacks(item.id, props.itemType);
    const conversionData = conversionsIndex && conversionsIndex();
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")!()!;
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")!()!;
    const buildingData = BitCraftTables.BuildingDesc.indexedBy("id")!()!;

    const additionalUses = new Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][]]>();

    function cappedLevelToStat(req: CappedLevelRequirement) {
        let skillTag: string = skillData.get(req.skillId)?.skillCategory.tag ?? "";
        if (skillTag === "Adventure") skillTag = "Skill";
        return [
            skillTag + ":",
            `Lv. ${req.minLevel}-${req.maxLevel} ${skillData.get(req.skillId)?.name}`
        ] as [JSX.Element, JSX.Element];
    }

    function experienceStackToStat(exp: ExperienceStackF32) {
        return [
            `${skillData.get(exp.skillId)?.name} Exp:`,
            `${fixFloat(exp.quantity)}`
        ] as [JSX.Element, JSX.Element];
    }

    function addTaskToMap(task: TravelerTaskDesc, map: any) {
        const inputs = task.requiredItems;
        const outputs = task.rewardedItems;
        const stats = [
            cappedLevelToStat(task.levelRequirement),
            experienceStackToStat(task.rewardedExperience)
        ]
        const skill = skillData.get(task.levelRequirement.skillId)?.name;
        map.set(
            "travelerTask_" + task.id,
            [
                (skill ? skill + " " : "") + "Traveler Task",
                <ItemStackArrayComponent stacks={() => inputs}/>,
                outputs, stats
            ]
        )
    }

    function addConversionToMap(conv: ItemConversionRecipeDesc, map: any) {
        map.set(
            "conversion_" + conv.id,
            [
                conv.name,
                <ItemStackArrayComponent stacks={() => conv.inputItems}/>,
                (conv.outputItem ? [conv.outputItem] : []) as ItemStack[],
                [
                    ["Time:", fixFloat(conv.timeCost)],
                    ["Stamina:", fixFloat(conv.staminaCost)],
                    // nothing uses this, dunno what it is
                    //["Tool:", <>Tier <TierIcon tier={conv.requiredEquipmentTier}/> </>]
                ],
            ]
        )
    }

    function addConstructionToMap(cons: ConstructionRecipeDesc, map: any) {
        const inputs = <ItemStackArrayComponent
            stackProps={() => [
                ...cons.consumedItemStacks.map((s: InputItemStack) => {
                    return {item: [s.itemType.tag, s.itemId], quantity: s.quantity} as ItemStackIconProps
                }),
                ...cons.consumedCargoStacks.map((s: InputItemStack) => {
                    return {item: [s.itemType.tag, s.itemId], quantity: s.quantity} as ItemStackIconProps
                })
            ]}
        />;
        const stats = [
            ["Effort:", cons.actionsRequired],
            ["Time:", fixFloat(cons.timeRequirement)],
            ["Stamina:", fixFloat(cons.staminaRequirement)],
            ...cons.levelRequirements.map(req => skillReqPair(req, skillData)),
            ...cons.experiencePerProgress.map(exp => experienceStackToStat(exp)),
            ...cons.toolRequirements.map(req => toolReqPair(req, toolData)),
        ]
        map.set(
            "construction_" + cons.id,
            [
                "Construct " + cons.name,
                inputs,
                () => <BuildingIcon building={cons.buildingDescriptionId}/>,
                stats
            ]
        )
    }

    function addDeconstructionToMap(cons: DeconstructionRecipeDesc, map: any) {
        const outputs = <ItemStackArrayComponent
            stackProps={() => [
                ...cons.outputItemStacks.map((s: ItemStack) => {
                    return {item: [s.itemType.tag, s.itemId], quantity: s.quantity} as ItemStackIconProps
                }),
                ...(cons.outputCargoId
                    ? [{item: [ItemType.Cargo.tag, cons.outputCargoId], quantity: 1} as ItemStackIconProps]
                    : [])
            ]}
        />;
        const stats = [
            ["Time:", fixFloat(cons.timeRequirement)],
            ...cons.levelRequirements.map(req => skillReqPair(req, skillData)),
            ...cons.experiencePerProgress.map(exp => experienceStackToStat(exp)),
            ...cons.toolRequirements.map(req => toolReqPair(req, toolData)),
        ]
        const building = buildingData.get(cons.consumedBuilding);
        map.set(
            "deconstruction_" + cons.id,
            [
                "Deconstruct " + (building?.name ?? "unknown building"),
                <BuildingIcon building={cons.consumedBuilding}/>,
                () => outputs,
                stats
            ]
        )
    }

    conversionData && conversionData[0].forEach(conv => addConversionToMap(conv, additionalUses));

    const travelerTaskData = BitCraftTables.TravelerTaskDesc.findByItemStacks(item.id, props.itemType);
    travelerTaskData()![0].forEach(task => addTaskToMap(task, additionalUses));
    const travelerTradeData = BitCraftTables.TravelerTradeOrderDesc.findByItemStacks(item.id, props.itemType);
    travelerTradeData()![0].forEach(trade => addTradeToMap(trade, additionalUses, skillData));

    const constructionData = BitCraftTables.ConstructionRecipeDesc.findByItemStacks(item.id, props.itemType);
    constructionData()![0].forEach(construction => addConstructionToMap(construction, additionalUses));

    const additionalAcquisitions = new Map<string, [string, JSX.Element, ItemStack[] | ProbabilisticItemStack[] | ItemListDesc[], [JSX.Element, JSX.Element][]]>();
    const itemListData = BitCraftTables.ItemListDesc.findByItemStacks(item.id, props.itemType);
    const itemsByListId = BitCraftTables.ItemDesc.indexedBy("itemListId");
    itemListData()![1].forEach(res => {
        const name = res.name;
        const itemWithList = itemsByListId!()!.get(res.id);
        if (!itemWithList) {
            console.log(`ItemList ${res.id} doesn't have corresponding item. Skipping.`);
            return;
        }
        additionalAcquisitions.set(
            "itemList_" + res.id,
            [name + " (item list)", <ItemIcon item={itemWithList}/>, [res], []]
        );
    });
    const resourceDepletion = BitCraftTables.ResourceDesc.findByItemStacks(item.id, props.itemType);
    resourceDepletion()![1].forEach(res => {
        const name = "Deplete " + res.name;
        const input = <ResourceIcon res={res}/>;
        const outputs = collapseStacks(res.onDestroyYield);
        additionalAcquisitions.set("resourceDeplete_" + res.id, [name, input, outputs, []]);
    });
    travelerTaskData()![1].forEach(task => addTaskToMap(task, additionalAcquisitions));
    travelerTradeData()![1].forEach(trade => addTradeToMap(trade, additionalAcquisitions, skillData));
    conversionData && conversionData[1].forEach(conv => addConversionToMap(conv, additionalUses));

    const deconstructionData = BitCraftTables.DeconstructionRecipeDesc.findByItemStacks(item.id, props.itemType);
    deconstructionData()![1].forEach(deconstruction => addDeconstructionToMap(deconstruction, additionalAcquisitions));

    const usageOptions = recipeMaps.useRecipe.values().map(([n, v]) => {
        return {label: n, value: "craft_" + v.id}
    }).toArray();
    usageOptions.push(...recipeMaps.useExtraction.values().map(([n, v]) => {
        return {label: n, value: "extraction_" + v.id}
    }).toArray())
    usageOptions.push(...additionalUses.entries().map((([n, v]) => {
        return {label: v[0], value: n}
    })));

    const acquireOptions = recipeMaps.acquireRecipe.values().map(([n, v]) => {
        return {label: n, value: "craft_" + v.id}
    }).toArray();
    acquireOptions.push(...recipeMaps.acquireExtraction.values().map(([n, v]) => {
        return {label: n, value: "extraction_" + v.id}
    }).toArray())
    acquireOptions.push(...additionalAcquisitions.entries().map(([n, v]) => {
        return {label: v[0], value: n}
    }));

    const [usageValue, setUsageValue] = createSignal<Option>((usageOptions.length ? usageOptions[0] : ["No uses", ""]) as Option);
    const [acquireValue, setAcquireValue] = createSignal<Option>((acquireOptions.length ? acquireOptions[0] : ["No ways to obtain", ""]) as Option);

    return (
        <Show when={usageOptions.length || acquireOptions.length}>
            <Card>
                <CardContent class="mt-6">
                    <Tabs class="w-full">
                        <TabsList class="grid grid-cols-2">
                            <TabsTrigger value="obtain" disabled={acquireOptions.length == 0}>Obtain</TabsTrigger>
                            <TabsTrigger value="use" disabled={usageOptions.length == 0}>Use</TabsTrigger>
                        </TabsList>
                        <TabsContent value="obtain">
                            <RecipesPanel
                                value={acquireValue}
                                setValue={setAcquireValue}
                                options={acquireOptions}
                                recipeMap={recipeMaps.acquireRecipe}
                                extractionMap={recipeMaps.acquireExtraction}
                                additionalMap={additionalAcquisitions}
                            />
                        </TabsContent>
                        <TabsContent value="use">
                            <RecipesPanel
                                value={usageValue}
                                setValue={setUsageValue}
                                options={usageOptions}
                                recipeMap={recipeMaps.useRecipe}
                                extractionMap={recipeMaps.useExtraction}
                                additionalMap={additionalUses}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </Show>
    )
}

export function renderItemDescDialog(item: ItemDesc | CargoDesc, itemType: string) {
    return (
        <>
            <div class="flex flex-row">
                <ItemIcon item={item} noInteract={true}/>
                <div class="flex flex-col flex-1 justify-left ml-2">
                    {item.name}
                    <div>(Tier <TierIcon class="inline ml-1" tier={item.tier}/>, {item.rarity.tag})</div>
                </div>
            </div>
            <Show when={item.description}>
                <div class="flex flex-row justify-center">
                    <div class="text-muted-foreground max-w-[500px] text-balance text-center">{item.description}</div>
                </div>
            </Show>
            <Show when={itemType == ItemType.Item.tag}>
                <StatCard item={item} itemType={itemType}/>
            </Show>
            <RecipesCard item={item} itemType={itemType}/>
        </>
    )
}
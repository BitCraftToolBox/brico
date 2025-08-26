import {
    BuildingDesc,
    ConstructionRecipeDesc,
    DeconstructionRecipeDesc,
    ExperienceStackF32,
    InputItemStack,
    ItemStack,
    ItemType,
    LevelRequirement,
    SkillDesc,
    ToolRequirement,
    ToolTypeDesc
} from "~/bindings/src";
import {Accessor, Component, createSignal, For, JSX, Setter, Show} from "solid-js";
import {BitCraftTables} from "~/lib/spacetime";
import {TbArrowBigDownLines as IconDown} from "solid-icons/tb";
import {Card, CardContent} from "~/components/ui/card";
import {fixFloat} from "~/lib/utils";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {ItemStackArrayComponent, ItemStackIconProps} from "~/components/bitcraft/items";
import {TierIcon} from "~/components/bitcraft/misc";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {BuildingIcon} from "~/components/bitcraft/buildings";
import {getBuildingTier} from "~/lib/bitcraft-utils";
import {skillExpPair} from "~/components/details/itemdesc-details";


type BuildingCardProps = {
    building: BuildingDesc
}


type RecipePanelProps<T> = {
    recipe: T
    tabValue: string
    getInputs: (recipe: T) => JSX.Element
    getOutputs: (recipe: T) => JSX.Element
    getStatlines: (recipe: T) => [JSX.Element, JSX.Element][]
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
                    {props.getOutputs!(props.recipe)}
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
    recipeMap: Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][]]>
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
            <For each={props.recipeMap?.entries().toArray()}>
                {(additionalKey) => {
                    const [tabValue, additionalRecipe] = additionalKey;
                    return (
                        <RecipePanel<typeof additionalRecipe>
                            recipe={additionalRecipe}
                            tabValue={tabValue}
                            getInputs={(r) => r[1]}
                            getStatlines={(r) => r[3]}
                            getOutputs={additionalRecipe[2]}
                        />
                    )
                }}
            </For>
        </Tabs>
    </>
}

type OutputStacks = ((r: any) => JSX.Element);

const RecipesCard: Component<BuildingCardProps> = (props) => {
    const building = props.building;
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")!()!;
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")!()!;
    const buildingData = BitCraftTables.BuildingDesc.indexedBy("id")!()!;

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
            ...cons.levelRequirements.map(req => skillReqPair(req, skillData)).filter(p => !!p),
            ...cons.experiencePerProgress.map(exp => skillExpPair(exp, cons.actionsRequired, skillData)).filter(p => !!p),
            ...cons.toolRequirements.map(req => toolReqPair(req, toolData)).filter(p => !!p),
        ]
        map.set(
            "construction_" + cons.id,
            [
                "Construct " + cons.name,
                inputs,
                () => <BuildingIcon building={cons.buildingDescriptionId} />,
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
            ...cons.levelRequirements.map(req => skillReqPair(req, skillData)).filter(p => !!p),
            ...cons.experiencePerProgress.map(exp => skillExpPair(exp, undefined, skillData)).filter(p => !!p),
            ...cons.toolRequirements.map(req => toolReqPair(req, toolData)).filter(p => !!p),
        ]
        const building = buildingData.get(cons.consumedBuilding);
        map.set(
            "deconstruction_" + cons.id,
            [
                "Deconstruct " + (building?.name ?? "unknown building"),
                <BuildingIcon building={cons.consumedBuilding} />,
                () => outputs,
                stats
            ]
        )
    }

    const additionalUses = new Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][]]>();
    const additionalAcquisitions = new Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][]]>();

    const constructionData = BitCraftTables.ConstructionRecipeDesc.indexedBy("buildingDescriptionId");
    const buildRecipe = constructionData!()!.get(building.id);
    if (buildRecipe) {
        addConstructionToMap(buildRecipe, additionalAcquisitions)
    }

    const deconstructionData = BitCraftTables.DeconstructionRecipeDesc.indexedBy("consumedBuilding");
    const consumeRecipe = deconstructionData!()!.get(building.id);
    if (consumeRecipe) {
        addDeconstructionToMap(consumeRecipe, additionalUses)
    }

    const usageOptions = additionalUses.entries().map(([n, v]) => {
        return {label: v[0], value: n}
    }).toArray();
    const acquireOptions = additionalAcquisitions.entries().map(([n, v]) => {
        return {label: v[0], value: n}
    }).toArray();

    const [usageValue, setUsageValue] = createSignal<Option>((usageOptions.length ? usageOptions[0] : ["No uses", ""]) as Option);
    const [acquireValue, setAcquireValue] = createSignal<Option>((acquireOptions.length ? acquireOptions[0] : ["No ways to obtain", ""]) as Option);

    return (
        <Show when={usageOptions.length || acquireOptions.length}>
            <Card>
                <CardContent class="mt-6">
                    <Tabs class="w-full">
                        <TabsList class="grid grid-cols-2">
                            <TabsTrigger value="obtain" disabled={acquireOptions.length == 0}>Build</TabsTrigger>
                            <TabsTrigger value="use" disabled={usageOptions.length == 0}>Deconstruct</TabsTrigger>
                        </TabsList>
                        <TabsContent value="obtain">
                            <RecipesPanel
                                value={acquireValue}
                                setValue={setAcquireValue}
                                options={acquireOptions}
                                recipeMap={additionalAcquisitions}
                            />
                        </TabsContent>
                        <TabsContent value="use">
                            <RecipesPanel
                                value={usageValue}
                                setValue={setUsageValue}
                                options={usageOptions}
                                recipeMap={additionalUses}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </Show>
    )
}

export function renderBuildingDialog(building: BuildingDesc) {
    return (
        <>
            <div class="flex flex-row">
                <BuildingIcon building={building} noInteract={true}/>
                <div class="flex flex-col flex-1 justify-left ml-2">
                    {building.name}
                    <div>(Tier <TierIcon class="inline ml-1" tier={getBuildingTier(building)}/>)</div>
                </div>
            </div>
            <Show when={building.description}>
                <div class="flex flex-row justify-center">
                    <div class="text-muted-foreground max-w-[500px] text-balance text-center">{building.description}</div>
                </div>
            </Show>
            {/* TODO building stat display */}
            <RecipesCard building={building}/>
        </>
    )
}
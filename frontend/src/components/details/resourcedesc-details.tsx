import {
    ExperienceStackF32, ExtractionRecipeDesc, InputItemStack, ItemListDesc, ItemStack,
    LevelRequirement, ProbabilisticItemStack,
    ResourceDesc,
    SkillDesc,
    ToolRequirement,
    ToolTypeDesc
} from "~/bindings/ts";
import {Accessor, Component, createSignal, For, JSX, Setter, Show} from "solid-js";
import {BitCraftTables} from "~/lib/spacetime";
import {TbArrowBigDownLines as IconDown} from "solid-icons/tb";
import {Card, CardContent} from "~/components/ui/card";
import {fixFloat} from "~/lib/utils";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {TierIcon} from "~/components/bitcraft/misc";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {ResourceIcon} from "~/components/bitcraft/resources";
import {getResourceExtraction} from "~/lib/recipes";
import {expandStack, ItemStackArrayComponent} from "~/components/bitcraft/items";
import {collapseStacks, skillExpPair} from "~/components/details/itemdesc-details";


type ResourceCardProps = {
    resource: ResourceDesc
}


type RecipePanelProps<T> = {
    recipe: T
    tabValue: string
    getInputs: (recipe: T) => JSX.Element
    getOutputStacks?: (recipe: T) => ItemStack[] | ProbabilisticItemStack[] | ItemListDesc[]
    getStatlines: (recipe: T) => [JSX.Element, JSX.Element][]
    maskedProbabilities?: boolean
    chances?: number
}

function RecipePanel<T>(props: RecipePanelProps<T>) {
    return (
        <TabsContent value={props.tabValue} class="animate-none">
            <div class="flex flex-col items-center w-full  mx-auto gap-3 px-2 md:px-4">
                <div class="grid grid-flow-col auto-cols-auto justify-center gap-2">
                    {props.getInputs(props.recipe)}
                </div>
                <IconDown class="w-6 h-6 text-muted-foreground" />
                <div class="grid grid-flow-col auto-cols-auto justify-center gap-2">
                    <For each={props.getOutputStacks?.(props.recipe)} fallback={
                        <div class="col-span-full text-center text-muted-foreground">No Outputs</div>
                    }>
                        {(stack) => (
                            <div class="rounded-xl border border-border bg-muted/30 px-3 py-4 min-w-[80px] min-h-[80px] flex flex-col items-center justify-center text-center shadow-sm">
                                {expandStack(stack, props.maskedProbabilities, props.chances)}
                            </div>
                        )}
                    </For>
                </div>
                <div class="grid w-full max-w-md gap-2">
                    <For each={props.getStatlines(props.recipe)}>
                        {([label, value]) => (
                            <div class="flex justify-between items-center border-b border-muted py-1 px-1">
                                <div class="text-sm text-muted-foreground font-medium">{label}</div>
                                <div class="text-sm font-semibold text-right">{value}</div>
                            </div>
                        )}
                    </For>
                </div>
            </div>
        </TabsContent>
    );
}


type RecipesPanelProps = {
    value: Accessor<Option>,
    setValue: Setter<Option>,
    options: Option[]
    recipeMap: Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][], ExtractionRecipeDesc | undefined, ResourceDesc]>
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
                            getOutputStacks={(r) => r[2]}
                            maskedProbabilities={additionalRecipe[4]?.verbPhrase === "Loot"}
                            chances={additionalRecipe[5].maxHealth}
                        />
                    )
                }}
            </For>
        </Tabs>
    </>
}

type OutputStacks = ItemStack[] | ProbabilisticItemStack[] | ItemListDesc[];

const RecipesCard: Component<ResourceCardProps> = (props) => {
    const res = props.resource;
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")!()!;
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")!()!;

    const additionalUses = new Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][], ExtractionRecipeDesc | undefined, ResourceDesc]>();
    const additionalAcquisitions = new Map<string, [string, JSX.Element, OutputStacks, [JSX.Element, JSX.Element][], ExtractionRecipeDesc, ResourceDesc]>();

    const extractionData = getResourceExtraction(res);
    if (extractionData) {
        const r: ExtractionRecipeDesc = extractionData[1][1];
        const inputs = <>
            <ItemStackArrayComponent
                stackProps={() => r.consumedItemStacks.map((s: InputItemStack) => {
                    return {item: [s.itemType.tag, s.itemId], quantity: s.quantity}
                })}
            />
            <div class="self-start"><ResourceIcon res={res.id}/></div>
        </>;
        const outputs = r.extractedItemStacks
            .map((p: ProbabilisticItemStack) => p).filter((s: ProbabilisticItemStack) => !!s)
        const stats: [JSX.Element, JSX.Element][] = [];
        stats.push(["Total HP", res.maxHealth]);
        stats.push(["Time:", fixFloat(r.timeRequirement)]);
        stats.push(["Stamina:", fixFloat(r.staminaRequirement)])
        stats.push(...r.experiencePerProgress.map((xp) => skillExpPair(xp, res.maxHealth, skillData)).filter(p => !!p))
        stats.push(...r.levelRequirements.map((req) => skillReqPair(req, skillData)).filter(p => !!p))
        stats.push(...r.toolRequirements.map((req) => toolReqPair(req, toolData)).filter(p => !!p))
        additionalUses.set(
            "extraction_" + extractionData[0],
            [
                extractionData[1][0], inputs, outputs,
                stats, extractionData[1][1], res
            ]
        )
    }
    if (res.onDestroyYield.length) {
        const name = "Deplete " + res.name;
        const input = <ResourceIcon res={res}/>;
        const outputs = collapseStacks(res.onDestroyYield);
        additionalUses.set("resourceDeplete_" + res.id, [name, input, outputs, [], undefined, res]);
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
                <CardContent class="mt-6 px-10">
                    <Tabs class="w-full h-fit">
                        <TabsList class="grid grid-cols-2">
                            <TabsTrigger value="obtain" disabled={acquireOptions.length == 0}>Obtain</TabsTrigger>
                            <TabsTrigger value="use" disabled={usageOptions.length == 0}>Use</TabsTrigger>
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

export function renderResourceDialog(resource: ResourceDesc) {
    return (
        <>
            <div class="flex flex-row">
                <ResourceIcon res={resource} noInteract={true}/>
                <div class="flex flex-col flex-1 justify-left ml-2">
                    {resource.name}
                    <div>(Tier <TierIcon class="inline ml-1" tier={resource.tier}/>, {resource.rarity.tag})</div>
                </div>
            </div>
            <Show when={resource.description}>
                <div class="flex flex-row justify-center">
                    <div class="text-muted-foreground max-w-[500px] text-balance text-center">{resource.description}</div>
                </div>
            </Show>
            <RecipesCard resource={resource}/>
        </>
    )
}
import {CargoDesc, ItemDesc, ItemListDesc, ItemStack, ItemType, ProbabilisticItemStack} from "~/bindings/ts";
import {Accessor, Component, ComponentProps, createEffect, createSignal, For, Show, splitProps} from "solid-js";
import {cn, fixFloat, RequireOnlyOne} from "~/lib/utils";
import {cleanAssetPath, Rarities, stackToItemOrCargo, Tiers} from "~/lib/bitcraft-utils";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {TierIcon} from "~/components/bitcraft/misc";
import {BitCraftTables} from "~/lib/spacetime";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "~/components/ui/hover-card";
import {Separator} from "~/components/ui/separator";
import {useDetailDialog, useFullNodeContext} from "~/lib/contexts";

type ItemIconProps = ComponentProps<"div"> & {
    item: [string, number] | ItemDesc | CargoDesc
    small?: boolean
    noInteract?: boolean,
    quantity?: number
}

const height = "h-[104px]";
const widthCargo = "w-[184px]";
const widthItem = "w-[76px]";

const heightSmall = "h-[52px]";
const widthCargoSmall = "w-[97px]";
const widthItemSmall = "w-[38px]";

function getWidth(isItem: boolean, isSmall: boolean) {
    if (isItem) {
        return isSmall ? widthItemSmall : widthItem;
    } else {
        return isSmall ? widthCargoSmall : widthCargo;
    }
}

function getHeight(_: boolean, isSmall: boolean) {
    return isSmall ? heightSmall : height;
}

export const ItemIcon: Component<ItemIconProps> = (props: ItemIconProps) => {
    const [local, others] = splitProps(props, ["class", "item", "small", "noInteract"]);
    const small = typeof local.small === "undefined" ? true : local.small;
    const noInteract = local.noInteract || false;

    let item: ItemDesc | CargoDesc;
    let divW: typeof widthCargo | typeof widthItem | typeof widthCargoSmall | typeof widthItemSmall;
    let divH: typeof height | typeof heightSmall;

    let isItem: boolean;

    if (Array.isArray(local.item)) {
        item = stackToItemOrCargo(local.item);
        let localType = local.item[0];
        if (typeof localType !== 'string') { // @ts-ignore
            localType = localType.tag;
        }
        isItem = localType === ItemType.Item.tag;
        divW = getWidth(isItem, small);
        divH = getHeight(isItem, small);
    } else {
        item = local.item;
        isItem = !Object.hasOwn(local.item, "carriedModelAssetName");
        divW = getWidth(isItem, small);
        divH = getHeight(isItem, small);
    }
    const bgColor = Tiers.getBackgroundColorClass(item.tier);
    const borderColor = Rarities.getBorderColorClass(item.rarity);

    let path = item.iconAssetName
        ? "/assets/" + cleanAssetPath(item.iconAssetName, props.quantity) + ".webp"
        : "/assets/Unknown.webp";

    const dialog = useDetailDialog();

    return (
        <Tooltip disabled={noInteract}>
            <TooltipTrigger onclick={(ev: MouseEvent) => {
                if (noInteract) return;
                dialog.setContent([isItem ? "ItemDesc" : "CargoDesc", item]);
                dialog.setOpen(true);
                ev.stopPropagation();
            }}>
                <div
                    class={cn(`rounded border-3 mx-1 ${borderColor} ${bgColor} ${divW} ${divH}`, local.class)}
                    {...others}
                >
                    <img src={path} alt={item.name}/>
                </div>
            </TooltipTrigger>
            <TooltipContent class={`border-1 ${borderColor}`}>
                {item.name} <TierIcon tier={item.tier}/>, {item.rarity as unknown as string /* TODO .tag */}
            </TooltipContent>
        </Tooltip>
    )
}

type ProbabilityIndicatorProps = {
    probability: number | "UNKNOWN"
    chances?: number
}

const ProbabilityIndicator: Component<ProbabilityIndicatorProps> = (props) => {
    if (props.probability === "UNKNOWN") {
        return (
            <Tooltip>
                <TooltipTrigger>?%</TooltipTrigger>
                <TooltipContent>
                    Unknown probability, private server-side value.
                </TooltipContent>
            </Tooltip>
        )
    }
    const text = fixFloat(props.probability * 100) + "%";
    if (typeof props.chances !== 'undefined') {
        const total = fixFloat(props.chances * props.probability);
        const fullNode = useFullNodeContext();
        return (
            <Tooltip>
                <TooltipTrigger
                    onclick={() => fullNode.toggle()}
                >
                    {fullNode.useFullNode() ? total : text}
                </TooltipTrigger>
                <TooltipContent>
                    {props.chances} * {text} = {total} avg. outputs
                </TooltipContent>
            </Tooltip>
        )
    }
    return text;
}

type ItemStackIconProps = ItemIconProps & {
    quantity: number | [number, number]
    hideSingle?: boolean
    probability?: number | "UNKNOWN"
    chances?: number
    showName?: boolean
}

export const ItemStackIcon: Component<ItemStackIconProps> = (props) => {
    const [local, others] = splitProps(props, ["quantity", "hideSingle"]);
    let text = Array.isArray(local.quantity)
        ? local.quantity[0] + '-' + local.quantity[1]
        : local.quantity == 1 && local.hideSingle ? "" : String(local.quantity);
    if (props.showName) {
        const item = Array.isArray(others.item) ? stackToItemOrCargo(others.item) : others.item;
        const name = item.name;
        text = text ? text + "x " + name : name;
    }
    return (
        <div class="flex flex-col items-center">
            <Show when={props.probability}>
                <ProbabilityIndicator
                    probability={props.probability!}
                    chances={props.chances}
                />
            </Show>
            <ItemIcon {...others} quantity={local.quantity}/>
            <Show when={text}>
                <p>{text}</p>
            </Show>
        </div>
    )
}

type ItemStackArrayProps = RequireOnlyOne<{
    class?: string
    stacks?: Accessor<ItemStack[]>
    small?: boolean
    stackProps?: Accessor<ItemStackIconProps[]>
    showName?: boolean
}, 'stacks' | 'stackProps'>

export const ItemStackArrayComponent: Component<ItemStackArrayProps> = (props) => {
    let stackProps: Accessor<ItemStackIconProps[]>;
    if (props.stacks) {
        stackProps = () => props.stacks().map(s => {
            return {item: stackToItemOrCargo(s), quantity: s.quantity, small: props.small}
        });
    } else {
        stackProps = props.stackProps;
    }
    return (
        <div class={cn(`flex flex-row justify-center`, props.class)}>
            <For each={stackProps()}>
                {stack => <ItemStackIcon {...stack} showName={props.showName} />}
            </For>
        </div>
    )
}

type ItemListComponentProps = {
    itemList: number | ItemListDesc
    original?: ItemStack;
    showTip?: boolean
    probability?: number | "UNKNOWN"
    chances?: number
}

export const ItemListComponent: Component<ItemListComponentProps> = (props) => {
    const itemList = typeof props.itemList === 'number'
        ? BitCraftTables.ItemListDesc.indexedBy("id")!()!.get(props.itemList)!
        : props.itemList;

    const possibilities = itemList.possibilities.sort((a, b) => b.probability - a.probability);

    const fullNode = useFullNodeContext();
    const [nodeFactor, setNodeFactor] = createSignal(1);
    createEffect(() =>
        setNodeFactor(fullNode.useFullNode() && typeof props.probability === 'number' && props.chances ? (props.probability * props.chances) : 1)
    )
    const [averages, setAverages] = createSignal<ItemStackIconProps[]>([]);

    createEffect(() => {
        const totals = new Map<string, [number, [string, number]]>();
        let totalWeight = 0;
        possibilities.forEach(poss => {
            totalWeight += poss.probability;
            poss.items.forEach(stack => {
                const key = stack.itemType as unknown as string /* TODO .tag */ + "_" + stack.itemId;
                const weighted = stack.quantity * poss.probability * nodeFactor();
                totals.set(key, [totals.has(key) ? totals.get(key)![0] + weighted : weighted, [stack.itemType as unknown as string /* TODO .tag */, stack.itemId]]);
            })
        })
        setAverages(totals.entries().map(entry => {
            const total = entry[1][0];
            const item = entry[1][1];
            return {
                item: item,
                quantity: fixFloat(total / totalWeight, 3)
            }
        }).toArray());
    })

    return (
        <HoverCard>
            <HoverCardTrigger class="rounded border-accent-foreground border-l-1 border-r-1 mx-1">
                <Show when={props.probability}>
                    <div class="text-center">
                        <ProbabilityIndicator probability={props.probability!} chances={props.chances}/>
                    </div>
                </Show>
                <ItemStackArrayComponent stackProps={averages}/>
                <Show when={props.showTip}>
                    <div class="text-center text-muted-foreground underline decoration-1 decoration-dashed"
                         onclick={() =>
                             typeof props.probability === 'number' && props.chances && fullNode.toggle()
                         }
                    >
                        {`(avg. / ${fullNode.useFullNode() ? "full yield" : "output"})`}
                    </div>
                </Show>
            </HoverCardTrigger>
            <HoverCardContent class="w-auto min-w-64">
                <div class="grid grid-flow-row grid-cols-2 justify-items-center overflow-y-auto max-h-[50vh]">
                    <p class="text-center mb-2 col-span-2">Weighted List</p>
                    <Show when={props.original}>
                        <div class="col-span-2 justify-self-center">
                            <ItemStackIcon
                                item={[props.original!.itemType as unknown as string /* TODO .tag */, props.original!.itemId]}
                                quantity={props.original!.quantity}
                            />
                        </div>
                    </Show>
                    <div>Weight</div>
                    <div>Items</div>
                    <For each={possibilities}>
                        {(poss) => (
                            <>
                                <Separator class="my-2 col-span-2 border-muted-foreground"/>
                                <div class="place-self-center">{fixFloat(poss.probability, 3)}</div>
                                <ItemStackArrayComponent stacks={() => poss.items}/>
                            </>
                        )}
                    </For>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
}

export function expandStack(input: ItemStack | ProbabilisticItemStack | ItemListDesc, maskedProbabilities: boolean = false, chances?: number) {
    let probability: number | undefined;
    let stack: ItemStack;
    if (Object.hasOwn(input, "itemStack")) {
        const inner = (input as ProbabilisticItemStack).itemStack;
        if (!inner) return <></>;
        probability = (input as ProbabilisticItemStack).probability;
        stack = inner;
    } else if (Object.hasOwn(input, 'possibilities')) {
        return <ItemListComponent
            itemList={input as ItemListDesc}
            showTip={true}
        />
    } else {
        stack = input as ItemStack;
    }
    const item = stackToItemOrCargo(stack);
    if (Object.hasOwn(item, "itemListId") && (item as ItemDesc).itemListId) {
        return (
            <ItemListComponent
                original={stack}
                itemList={(item as ItemDesc).itemListId}
                showTip={true}
                probability={maskedProbabilities ? "UNKNOWN" : probability}
                chances={chances}
            />
        )
    }
    return <ItemStackIcon
        item={item}
        quantity={stack.quantity}
        probability={maskedProbabilities ? "UNKNOWN" : probability}
        chances={chances}
    />
}
import {Trans} from "@lingui/solid/macro";
import {TbOutlineCheck as IconCheck, TbOutlineCirclePlus as IconCirclePlus} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import type {ValueBasedOption} from "~/components/data-table/table-faceted-filter";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator} from "~/components/ui/command";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {Separator} from "~/components/ui/separator";
import {cn} from "~/lib/utils";

/**
 * A multi-select value filter whose selection is owned by the caller: a dashed trigger showing the
 * selected options as removable badges, and a searchable checklist with "Clear filters". An empty
 * selection means no filter.
 */
export function ValueFilterPopover(props: {
    title: string;
    options: readonly ValueBasedOption[];
    selected: readonly any[];
    onChange: (selected: any[]) => void;
    /** Row counts per option value, shown at the end of each item. */
    counts?: ReadonlyMap<any, number>;
}) {
    const [open, setOpen] = createSignal(false);
    const [search, setSearch] = createSignal("");

    const filtered = createMemo(() => {
        const needle = search().trim().toLowerCase();
        return needle ? props.options.filter(option => option.label.toLowerCase().includes(needle)) : props.options;
    });
    const labelOf = (value: any) => props.options.find(option => option.value === value)?.label ?? String(value ?? "");
    const toggle = (value: any) => props.onChange(
        props.selected.includes(value) ? props.selected.filter(item => item !== value) : [...props.selected, value],
    );
    const removeBadge = (event: MouseEvent, value?: any) => {
        event.stopPropagation();
        props.onChange(value === undefined ? [] : props.selected.filter(item => item !== value));
    };

    return (
        <Popover fitViewport={true} slide={true} overlap={true} placement="bottom-start" open={open()} onOpenChange={setOpen}>
            <PopoverTrigger
                as={Button<"button">} variant="outline" size="sm" onclick={() => setOpen(!open())}
                class={`h-8 border-dashed ${props.selected.length ? "border-muted-foreground border-solid" : ""}`}
            >
                <IconCirclePlus/>
                {props.title}
                <Show when={props.selected.length}>
                    <Separator orientation="vertical" class="mx-2 h-4"/>
                    <Badge variant="secondary" class="rounded-sm px-1 hover:bg-red-500 lg:hidden" onclick={event => removeBadge(event)}>
                        {props.selected.length}
                    </Badge>
                    <div class="hidden space-x-1 lg:flex">
                        <Show
                            when={props.selected.length < 3}
                            fallback={
                                <Badge variant="secondary" class="rounded-sm px-1 hover:bg-red-500" onclick={event => removeBadge(event)}>
                                    <Trans>{props.selected.length} selected</Trans>
                                </Badge>
                            }
                        >
                            <For each={props.selected}>
                                {value => (
                                    <Badge variant="secondary" class="rounded-sm px-1 hover:bg-red-500" onclick={event => removeBadge(event, value)}>
                                        {labelOf(value)}
                                    </Badge>
                                )}
                            </For>
                        </Show>
                    </div>
                </Show>
            </PopoverTrigger>
            <PopoverContent class="w-[250px] p-0">
                <Command shouldFilter={false}>
                    <CommandInput placeholder={props.title} value={search()} onValueChange={setSearch}/>
                    <CommandList>
                        <CommandEmpty><Trans>No results found.</Trans></CommandEmpty>
                        <CommandGroup>
                            <For each={filtered()}>
                                {option => {
                                    const isSelected = () => props.selected.includes(option.value);
                                    return (
                                        <CommandItem onSelect={() => toggle(option.value)}>
                                            <div class={cn(
                                                "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected() ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                                            )}>
                                                <IconCheck/>
                                            </div>
                                            <Show when={option.icon} keyed>
                                                {icon => icon({value: option.value, class: "mr-2 size-4 text-muted-foreground"})}
                                            </Show>
                                            <span>{option.label}</span>
                                            <Show when={props.counts?.get(option.value)}>
                                                {count => <span class="ml-auto flex size-4 items-center justify-center font-mono text-xs">{count()}</span>}
                                            </Show>
                                        </CommandItem>
                                    );
                                }}
                            </For>
                        </CommandGroup>
                        <Show when={props.selected.length > 0}>
                            <CommandSeparator/>
                            <CommandGroup>
                                <CommandItem onSelect={() => props.onChange([])} class="justify-center text-center">
                                    <Trans>Clear filters</Trans>
                                </CommandItem>
                            </CommandGroup>
                        </Show>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

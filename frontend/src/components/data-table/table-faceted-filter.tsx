import {useSearchParams} from "@solidjs/router";
import type {Column, Table} from "@tanstack/solid-table"

import {TbOutlineCheck as IconCheck, TbOutlineCirclePlus as IconCirclePlus, TbOutlineX as IconX} from "solid-icons/tb"
import {createMemo, createSignal, For, JSX, ParentProps, Show} from "solid-js"
import {Badge} from "~/components/ui/badge"
import {Button} from "~/components/ui/button"
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator} from "~/components/ui/command"
import {NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput} from "~/components/ui/number-field";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover"
import {Separator} from "~/components/ui/separator"
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from "~/components/ui/slider";
import {cn, ensurePagesVisible} from "~/lib/utils"
import {Switch, SwitchControl, SwitchLabel, SwitchThumb} from "../ui/switch"


type OptionBase = {
    label: string
    icon?: (props: { class?: string, value: any }) => JSX.Element
}
export type ValueBasedOption<T = any> = OptionBase & {
    value: T
};
export type RangedBasedOption = OptionBase & {
    minMax: [number, number]
};

/** Key format: "StatTag_abs" or "StatTag_pct" */
export type StatsFilterValue = {
    requireAll: boolean,
    stats: Record<string, [number, number]>
};

export type StatsOptionEntry = {
    key: string;
    label: string;
    isPct: boolean;
    minMax: [number, number];
};

export type StatsBasedOption = OptionBase & {
    stats: StatsOptionEntry[];
};

type ValueProps<TData> = {
    type: "value";
    options: ValueBasedOption[] | ((col: Column<TData> | undefined) => ValueBasedOption[]);
}
type BoolProps<TData> = {
    type: "bool";
    options: ValueBasedOption<boolean>[] | ((col: Column<TData> | undefined) => ValueBasedOption<boolean>[]);
}
type RangeProps<TData> = {
    type: "range";
    options: RangedBasedOption | ((col: Column<TData> | undefined) => RangedBasedOption);
}
type StatProps<TData> = {
    type: "stat";
    options: StatsBasedOption | ((col: Column<TData> | undefined) => StatsBasedOption);
}

export type TableFacetedFilterProps<TData> = {
    table: Table<TData>
    column?: Column<TData>
    title?: string
} & (ValueProps<TData> | BoolProps<TData> | RangeProps<TData> | StatProps<TData>);

type BadgeOpts<TData> = ParentProps<{
    table: Table<TData>
    column?: Column<TData>
    option?: string
    values: () => (any[] | [number, number])
    class?: string
}>

function FilterBadge<TData>(props: BadgeOpts<TData>) {
    return (
        <Badge variant="secondary" class={cn("rounded-sm px-1 hover:bg-red-500", props.class)}
               onclick={(e) => {
                   const oldValues = props.values();
                   if (!oldValues) return;
                   if (Object.hasOwn(props, 'option')) {
                       let newValues = oldValues.filter((item) => item !== props.option);
                       props.column?.setFilterValue(newValues.length ? newValues : undefined);
                   } else {
                       props.column?.setFilterValue(undefined);
                   }
                   e.stopPropagation()
                   ensurePagesVisible(props.table);
               }}
        >
            {props.children}
        </Badge>
    )
}

// ─── Stats Filter Badge ─────────────────────────────────────────

function StatsFilterBadge<TData>(props: {
    table: Table<TData>;
    column?: Column<TData>;
    statKey: string;
    label: string;
}) {
    return (
        <Badge variant="secondary" class="rounded-sm px-1 hover:bg-red-500"
               onclick={(e) => {
                   if (props.statKey) {
                       const current = (props.column?.getFilterValue() ?? {}) as StatsFilterValue;
                       const updatedStats = {...current.stats};
                       delete updatedStats[props.statKey];
                       props.column?.setFilterValue(Object.keys(updatedStats).length ? {
                           requireAll: current.requireAll,
                           stats: updatedStats
                       } : undefined);
                   } else {
                       props.column?.setFilterValue(undefined);
                   }
                   e.stopPropagation();
                   ensurePagesVisible(props.table);
               }}
        >
            {props.label}
        </Badge>
    );
}

// ─── Stats Filter Content ───────────────────────────────────────

function StatsFilterContent<TData>(props: {
    table: Table<TData>;
    column?: Column<TData>;
    options: StatsBasedOption;
}) {
    const [search, setSearch] = createSignal("");

    const filterValue = (): StatsFilterValue =>
        (props.column?.getFilterValue() ?? {requireAll: true, stats: {}}) as StatsFilterValue;

    const selectedKeys = () => Object.keys(filterValue().stats);

    const filteredStats = () => {
        const s = search().trim().toLowerCase();
        if (!s) return props.options.stats;
        return props.options.stats.filter(stat => stat.label.toLowerCase().includes(s));
    };

    function toggleStat(stat: StatsOptionEntry) {
        const current = {...filterValue().stats};
        if (current[stat.key]) {
            delete current[stat.key];
        } else {
            current[stat.key] = [...stat.minMax];
        }
        props.column?.setFilterValue({requireAll: filterValue().requireAll, stats: current});
        ensurePagesVisible(props.table);
    }

    function updateRange(key: string, min: number, max: number) {
        const current = {...filterValue().stats};
        current[key] = [min, max];
        props.column?.setFilterValue({requireAll: filterValue().requireAll, stats: current});
        ensurePagesVisible(props.table);
    }

    function changeMode(val: boolean) {
        props.column?.setFilterValue({requireAll: !val, stats: {...filterValue().stats}});
    }

    return (
        <div class="flex flex-col max-h-[600px]">
            {/* Search */}
            <Command shouldFilter={false}>
                <CommandInput placeholder="Search stats..." value={search()} onValueChange={setSearch}/>
                <CommandGroup class="overflow-visible">
                    <Switch class="flex flex-row w-full justify-center gap-2 mt-1"
                            checked={!filterValue().requireAll} onChange={changeMode}
                    >
                        <SwitchLabel class="sr-only">Matching mode</SwitchLabel>
                        <span>All</span>
                        {/* Prevent "active" look when toggling - both sides are equal states, not active/non-active. */}
                        <SwitchControl class="bg-input data-[checked]:bg-input">
                            <SwitchThumb/>
                        </SwitchControl>
                        <span>Any</span>
                    </Switch>
                </CommandGroup>
                <CommandList class="max-h-[200px]">
                    <CommandEmpty>No stats found.</CommandEmpty>
                    <CommandGroup>
                        <For each={filteredStats()}>
                            {(stat) => {
                                const isSelected = () => !!filterValue().stats[stat.key];
                                return (
                                    <CommandItem onSelect={() => toggleStat(stat)}>
                                        <div class={cn(
                                            "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                            isSelected()
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50 [&_svg]:invisible"
                                        )}>
                                            <IconCheck/>
                                        </div>
                                        <span class="flex-1">{stat.label}</span>
                                        <Show when={isSelected()}>
                                            <span class="ml-auto text-xs text-muted-foreground">
                                                {filterValue().stats[stat.key][0]} - {filterValue().stats[stat.key][1]}
                                            </span>
                                        </Show>
                                        <Show when={props.column?.getFacetedUniqueValues()?.get(stat.key)}>
                                            {(count) => (
                                                <span class="ml-2 flex size-4 items-center justify-center font-mono text-xs">
                                                    {count()}
                                                </span>
                                            )}
                                        </Show>
                                    </CommandItem>
                                );
                            }}
                        </For>
                    </CommandGroup>
                    <Show when={selectedKeys().length > 0}>
                        <CommandSeparator/>
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    props.column?.setFilterValue({requireAll: filterValue().requireAll, stats: {}});
                                    ensurePagesVisible(props.table);
                                }}
                                class="justify-center text-center"
                            >
                                Clear all stat filters
                            </CommandItem>
                        </CommandGroup>
                    </Show>
                </CommandList>
            </Command>

            {/* Range controls for selected stats */}
            <Show when={selectedKeys().length > 0}>
                <Separator/>
                <div class="p-2 space-y-2 max-h-[250px] overflow-y-auto">
                    <div class="text-xs font-medium text-muted-foreground mb-1">Ranges</div>
                    <For each={selectedKeys()}>
                        {(key) => {
                            const stat = () => props.options.stats.find(s => s.key === key);
                            const range = () => filterValue().stats[key];
                            return (
                                <Show when={stat() && range()}>
                                    <div class="space-y-1">
                                        <div class="flex items-center justify-between">
                                            <span class="text-sm font-medium">{stat()!.label}</span>
                                            <button
                                                class="text-xs text-muted-foreground hover:text-destructive"
                                                onClick={() => toggleStat(stat()!)}
                                            >
                                                <IconX class="size-3"/>
                                            </button>
                                        </div>
                                        <div class="flex items-center gap-1">
                                            <NumberField
                                                class="w-20"
                                                rawValue={range()[0]}
                                                onRawValueChange={(v) => updateRange(key, v, range()[1])}
                                                minValue={stat()!.minMax[0]}
                                                maxValue={range()[1]}
                                                step={stat()!.isPct ? 0.1 : 1}
                                            >
                                                <NumberFieldGroup>
                                                    <NumberFieldInput class="h-8"/>
                                                    <NumberFieldIncrementTrigger/>
                                                    <NumberFieldDecrementTrigger/>
                                                </NumberFieldGroup>
                                            </NumberField>
                                            <span class="text-xs text-muted-foreground">–</span>
                                            <NumberField
                                                class="w-20"
                                                rawValue={range()[1]}
                                                onRawValueChange={(v) => updateRange(key, range()[0], v)}
                                                minValue={range()[0]}
                                                maxValue={stat()!.minMax[1]}
                                                step={stat()!.isPct ? 0.1 : 1}
                                            >
                                                <NumberFieldGroup>
                                                    <NumberFieldInput class="h-8"/>
                                                    <NumberFieldIncrementTrigger/>
                                                    <NumberFieldDecrementTrigger/>
                                                </NumberFieldGroup>
                                            </NumberField>
                                        </div>
                                    </div>
                                </Show>
                            );
                        }}
                    </For>
                </div>
            </Show>
        </div>
    );
}

// ─── Main Filter Component ──────────────────────────────────────

function BoolFilterItem(props: {
    column?: Column<any>,
    table: Table<any>,
    value: boolean,
    selectedValues: any[],
    resolvedOptions: ValueBasedOption[],
    facets: Map<any, number>,
}) {
    return <CommandItem onSelect={() => {
        const current = props.column?.getFilterValue();
        if (Array.isArray(current) && current.length && current.includes(props.value)) {
            props.column?.setFilterValue(undefined);
        } else {
            props.column?.setFilterValue([props.value]);
        }
        ensurePagesVisible(props.table);
    }}>
        <div class={cn(
            "mr-2 flex size-4 items-center justify-center rounded-full border border-primary",
            props.selectedValues.some(v => v === props.value)
                ? "bg-primary text-primary-foreground"
                : "opacity-50 [&_svg]:invisible"
        )}>
            <IconCheck/>
        </div>
        <span class="flex-1">
            {(props.resolvedOptions as ValueBasedOption[]).find(o => o.value === props.value)?.label ?? "Yes"}
            <Show when={(props.facets as Map<any, number>)?.get(props.value)}>
                {count => <span class="font-mono text-xs ml-2">{count()}</span>}
            </Show>
        </span>
    </CommandItem>;
}

export function TableFacetedFilter<TData>(props: TableFacetedFilterProps<TData>) {
    // Resolve options reactively — if options is a function, re-evaluate it
    // whenever TanStack's faceted values change (e.g., when data loads)
    const resolvedOptions = createMemo(() => {
        if (typeof props.options === 'function') {
            return props.options(props.column);
        }
        return props.options;
    });

    const isValueBased = () => props.type === "value";
    const isStatsBased = () => props.type === "stat";
    const isNumberBased = () => props.type === "range";
    const isBoolBased = () => props.type === "bool";

    const facets = () => isValueBased()
        ? props.column?.getFacetedUniqueValues()
        : isNumberBased()
            ? props.column?.getFacetedMinMaxValues()
            : undefined;

    const [searchParams] = useSearchParams();

    if (props.column && searchParams) {
        if (isValueBased() || isBoolBased()) {
            const val = searchParams[props.column.id];
            if (val) {
                const opts = (resolvedOptions() as ValueBasedOption[]);
                const validValues = (Array.isArray(val) ? val : [val])
                    .map(v => opts.find(o => String(o.value) === v))
                    .filter(v => !!v).map(v => v.value);
                if (validValues.length) {
                    props.column.setFilterValue(validValues);
                }
            }
        } else if (isNumberBased()) {
            const minVal = searchParams[props.column.id + ".min"];
            const maxVal = searchParams[props.column.id + ".max"];
            if (!Array.isArray(minVal) && !Array.isArray(maxVal)) {
                const minMax = (resolvedOptions() as RangedBasedOption).minMax;
                const min = Number(minVal);
                const max = Number(maxVal);
                if (!Number.isNaN(min) && !Number.isNaN(max)) {
                    // ensure provided range is in allowed range
                    const range = [Math.max(minMax[0], min), Math.min(minMax[1], max)];
                    props.column.setFilterValue(range);
                }
            }
        } else if (isStatsBased()) {
            let reqStr = searchParams[props.column.id + ".requireAll"];
            if (!reqStr || !Array.isArray(reqStr) && ["true", "false"].includes(reqStr)) {
                const opts = (resolvedOptions() as StatsBasedOption);
                const requireAll = reqStr !== "false"; // default to true if not provided
                const regex = new RegExp(`^${props.column!.id}\\.(.+)\\.(min|max)$`);
                const paramStats = Object.keys(searchParams).map(k => k.match(regex)?.[1]).filter((v): v is string => !!v);
                const validStats = new Map(opts.stats.filter(e => paramStats.includes(e.key)).map(e => [e.key, e.minMax]));
                const stats: Record<string, [number, number]> = {};
                validStats.forEach(([statMin, statMax], key) => {
                    const minStr = searchParams[`${props.column!.id}.${key}.min`];
                    const maxStr = searchParams[`${props.column!.id}.${key}.max`];
                    if (!Array.isArray(minStr) && !Array.isArray(maxStr)) {
                        const min = Number(minStr);
                        const max = Number(maxStr);
                        if (!Number.isNaN(min) && !Number.isNaN(max)) {
                            stats[key] = [Math.max(statMin, min), Math.min(statMax, max)];
                        }
                    }
                });
                if (stats && Object.keys(stats).length) {
                    props.column.setFilterValue({requireAll, stats});
                }
            }
        }
    }

    const selectedValues = () => {
        if (isStatsBased()) {
            const val = props.column?.getFilterValue() as StatsFilterValue;
            return Object.keys(val?.stats ?? {});
        }
        return isValueBased() || isBoolBased()
            ? (props.column?.getFilterValue() ?? []) as any[]
            : (props.column?.getFilterValue() ?? []) as [number, number];
    };

    const [search, setSearch] = createSignal("");
    const [popoverOpen, setPopoverOpen] = createSignal<boolean>(false);
    const [editingWithNumberInputs, setEditingWithNumberInputs] = createSignal<boolean>(false);
    let sliderEditMin!: HTMLInputElement | null;
    let sliderEditMax!: HTMLInputElement | null;

    const filteredOptions = () => {
        let s = search();
        if (!isValueBased()) return [];
        const o = resolvedOptions() as ValueBasedOption[];
        s = s.trim().toLowerCase()
        if (!s) return o;
        return o.filter((option) => {
            const label = option.label.toLowerCase();
            if (label.includes(s)) {
                return true;
            }
        });
    }

    return (
        <Popover placement="bottom-start" open={popoverOpen()}
                 onOpenChange={(open) => {
                     setPopoverOpen(open);
                     setEditingWithNumberInputs(false);
                 }}
        >
            <PopoverTrigger
                as={Button<"button">} variant="outline" size="sm" onclick={() => setPopoverOpen(!popoverOpen())}
                class={`h-8 border-dashed ${selectedValues().length ? "border-muted-foreground border-solid" : ""}`}
            >
                <IconCirclePlus/>
                {props.title}
                <Show when={selectedValues().length}>
                    <Separator orientation="vertical" class="mx-2 h-4"/>
                    <Show when={isStatsBased()}>
                        {/* Stats-based badges */}
                        {(() => {
                            const keys = selectedValues() as string[];
                            const statsOpts = resolvedOptions() as StatsBasedOption;
                            return (
                                <Show when={keys.length < 3} fallback={
                                    <StatsFilterBadge
                                        table={props.table} column={props.column}
                                        statKey="" label={`${keys.length} stats`}
                                    />
                                }>
                                    <div class="hidden space-x-1 lg:flex">
                                        <For each={keys}>
                                            {(key) => {
                                                const stat = statsOpts.stats.find(s => s.key === key);
                                                return (
                                                    <StatsFilterBadge
                                                        table={props.table} column={props.column}
                                                        statKey={key} label={stat?.label ?? key}
                                                    />
                                                );
                                            }}
                                        </For>
                                    </div>
                                    <StatsFilterBadge
                                        table={props.table} column={props.column}
                                        statKey="" label={String(keys.length)}
                                    />
                                </Show>
                            );
                        })()}
                    </Show>
                    <Show when={isNumberBased()}>
                        <FilterBadge values={selectedValues} table={props.table} column={props.column}>
                            {selectedValues()[0] + "-" + selectedValues()[1]}
                        </FilterBadge>
                    </Show>
                    <Show when={isValueBased() || isBoolBased()}>
                        <FilterBadge values={selectedValues} table={props.table} column={props.column} class="lg:hidden">
                            {selectedValues().length}
                        </FilterBadge>
                        <div class="hidden space-x-1 lg:flex">
                            <Show
                                when={selectedValues().length < 3}
                                fallback={
                                    <FilterBadge values={selectedValues} table={props.table} column={props.column}>
                                        {selectedValues().length} selected
                                    </FilterBadge>
                                }
                            >
                                <For each={selectedValues()}>
                                    {(option: any) =>
                                        <FilterBadge values={selectedValues} table={props.table} column={props.column}
                                                     option={option as string}>
                                            {typeof option === "boolean" ? (option ? "Yes" : "No") : option}
                                        </FilterBadge>
                                    }
                                </For>
                            </Show>
                        </div>
                    </Show>
                </Show>
            </PopoverTrigger>
            <PopoverContent class={cn("p-0", isStatsBased() ? "w-[300px]" : "w-[250px]")}>
                {/* Stats-based filter */}
                <Show when={isStatsBased()}>
                    <StatsFilterContent
                        table={props.table}
                        column={props.column}
                        options={resolvedOptions() as StatsBasedOption}
                    />
                </Show>
                {/* Number range filter */}
                <Show when={isNumberBased()}>
                    <Slider
                        disabled={(facets() as [number, number])[0] === (facets() as [number, number])[1]}
                        minValue={(facets() as [number, number])[0]}
                        maxValue={(facets() as [number, number])[1]}
                        defaultValue={
                            (selectedValues().length ? selectedValues() : facets()) as [number, number]
                        }
                        getValueLabel={(params) => `${params.values[0]} - ${params.values[1]}`}
                        onChangeEnd={(vals) => {
                            if (isNaN(vals[0]) || isNaN(vals[1])) {
                                return;
                            }
                            props.column?.setFilterValue(vals as [number, number])
                            ensurePagesVisible(props.table);
                        }}
                    >
                        <div class="flex flex-col w-full gap-3">
                            <div class="flex flex-row w-full justify-between px-2 pt-2">
                                <SliderLabel>Range</SliderLabel>
                                <SliderValueLabel
                                    class={`${editingWithNumberInputs() ? "" : "underline "}decoration-1 decoration-dashed`}
                                    onclick={() => setEditingWithNumberInputs(true)}
                                />
                            </div>
                            <div class="flex flex-row w-full justify-center items-center gap-1 px-2 pb-2">
                                <Show when={editingWithNumberInputs()} fallback={
                                    <SliderTrack class="m-2 bg-muted">
                                        <SliderFill/>
                                        <SliderThumb/>
                                        <SliderThumb/>
                                    </SliderTrack>
                                }>
                                    <NumberField class="w-20"
                                                 defaultValue={((selectedValues().length ? selectedValues() : facets()) as [number, number])[0]}
                                                 minValue={(facets() as [number, number])[0]}
                                                 maxValue={((selectedValues().length ? selectedValues() : facets()) as [number, number])[1]}
                                    >
                                        <NumberFieldGroup>
                                            <NumberFieldInput ref={sliderEditMin}/>
                                            <NumberFieldIncrementTrigger/>
                                            <NumberFieldDecrementTrigger/>
                                        </NumberFieldGroup>
                                    </NumberField>
                                    <span class="text-xs text-muted-foreground">–</span>
                                    <NumberField class="w-20"
                                                 defaultValue={((selectedValues().length ? selectedValues() : facets()) as [number, number])[1]}
                                                 minValue={((selectedValues().length ? selectedValues() : facets()) as [number, number])[0]}
                                                 maxValue={(facets() as [number, number])[1]}
                                    >
                                        <NumberFieldGroup>
                                            <NumberFieldInput ref={sliderEditMax}/>
                                            <NumberFieldIncrementTrigger/>
                                            <NumberFieldDecrementTrigger/>
                                        </NumberFieldGroup>
                                    </NumberField>
                                    <Button variant="ghost" onclick={() => {
                                        if (sliderEditMin && sliderEditMax) {
                                            const min = +sliderEditMin!.value.replace(/[^-.\d]/g, '');
                                            const max = +sliderEditMax!.value.replace(/[^-.\d]/g, '');
                                            if (!isNaN(min) && !isNaN(max)) {
                                                props.column?.setFilterValue([min, max]);
                                                ensurePagesVisible(props.table);
                                            }
                                        }
                                        setPopoverOpen(false);
                                        setEditingWithNumberInputs(false);
                                    }}><IconCheck/></Button>
                                </Show>
                            </div>
                        </div>
                    </Slider>
                </Show>
                {/* Value-based filter */}
                <Show when={isValueBased()}>
                    <Command shouldFilter={false}>
                        <CommandInput placeholder={props.title} value={search()} onValueChange={setSearch}/>
                        <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            <CommandGroup>
                                <For each={filteredOptions()}>
                                    {(option) => {
                                        const isSelected = () => (selectedValues() as any[]).includes(option.value)
                                        return (
                                            <CommandItem
                                                onSelect={() => {
                                                    let newValues
                                                    if (isSelected()) {
                                                        newValues = (selectedValues() as any[]).filter((item) => item !== option.value)
                                                    } else {
                                                        newValues = [...selectedValues(), option.value]
                                                    }
                                                    props.column?.setFilterValue(newValues.length ? newValues : undefined)
                                                    ensurePagesVisible(props.table);
                                                }}
                                            >
                                                <div
                                                    class={cn(
                                                        "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                                        isSelected()
                                                            ? "bg-primary text-primary-foreground"
                                                            : "opacity-50 [&_svg]:invisible"
                                                    )}
                                                >
                                                    <IconCheck/>
                                                </div>
                                                <Show when={option.icon} keyed>
                                                    {(icon) => icon({value: option.value, class: "mr-2 size-4 text-muted-foreground"})}
                                                </Show>
                                                <span>{option.label}</span>
                                                <Show when={(facets() as Map<any, number>)?.get(option.value)}>
                                                    {(count) => (
                                                        <span class="ml-auto flex size-4 items-center justify-center font-mono text-xs">
                                                        {count()}
                                                    </span>
                                                    )}
                                                </Show>
                                            </CommandItem>
                                        )
                                    }}
                                </For>
                            </CommandGroup>
                            <Show when={(selectedValues() as any[]).length > 0}>
                                <>
                                    <CommandSeparator/>
                                    <CommandGroup>
                                        <CommandItem
                                            onSelect={() => {
                                                props.column?.setFilterValue(undefined)
                                            }}
                                            class="justify-center text-center"
                                        >
                                            Clear filters
                                        </CommandItem>
                                    </CommandGroup>
                                </>
                            </Show>
                        </CommandList>
                    </Command>
                </Show>
                <Show when={isBoolBased()}>
                    <Command class="w-full h-full">
                        <CommandList>
                        <div class="flex flex-row w-full justify-around px-2 py-2">
                            <BoolFilterItem
                                value={true}
                                column={props.column}
                                table={props.table}
                                selectedValues={selectedValues()}
                                resolvedOptions={resolvedOptions() as ValueBasedOption[]}
                                facets={facets() as Map<any, number>}
                            />
                            <BoolFilterItem
                                value={false}
                                column={props.column}
                                table={props.table}
                                selectedValues={selectedValues()}
                                resolvedOptions={resolvedOptions() as ValueBasedOption[]}
                                facets={facets() as Map<any, number>}
                            />
                        </div>
                        </CommandList>
                    </Command>
                </Show>
            </PopoverContent>
        </Popover>
    )
}
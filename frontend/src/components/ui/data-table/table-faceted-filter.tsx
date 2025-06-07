import {createSignal, For, JSX, ParentProps, Show} from "solid-js"

import type {Column, Table} from "@tanstack/solid-table"

import {TbCheck as IconCheck, TbCirclePlus as IconCirclePlus} from "solid-icons/tb"
import {cn, ensurePagesVisible} from "~/lib/utils"
import {Badge} from "~/components/ui/badge"
import {Button} from "~/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "~/components/ui/command"
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover"
import {Separator} from "~/components/ui/separator"
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from "~/components/ui/slider";
import {Card, CardContent, CardTitle} from "~/components/ui/card";
import {
    NumberField,
    NumberFieldDecrementTrigger,
    NumberFieldGroup,
    NumberFieldIncrementTrigger,
    NumberFieldInput
} from "~/components/ui/number-field";


type OptionBase = {
    label: string
    icon?: (props: { class?: string }) => JSX.Element
}
export type ValueBasedOption = OptionBase & {
    value: any
};
export type NumberBasedOption = OptionBase & {
    minMax: [number, number]
};
export type TableFacetedFilterProps<TData> = {
    table: Table<TData>
    column?: Column<TData>
    title?: string
    options: ValueBasedOption[] | NumberBasedOption
}

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
                   if (!oldValues) return; // shouldn't happen if we're clicking on a current value
                   if (Object.hasOwn(props, 'option')) {
                       let newValues = oldValues.filter((item) => item !== props.option);
                       props.column?.setFilterValue(newValues.length ? newValues : undefined);
                   } else {
                       // if it's a min-max range, or a "x selected", just remove it
                       props.column?.setFilterValue(undefined);
                   }
                   e.stopPropagation() // don't bring up the menu if badges are clicked
                   ensurePagesVisible(props.table);
               }}
        >
            {props.children}
        </Badge>
    )
}

export function TableFacetedFilter<TData>(props: TableFacetedFilterProps<TData>) {
    const isValueBased = () => !Object.hasOwn(props.options, "minMax");
    const facets = () => isValueBased()
        ? props.column?.getFacetedUniqueValues()
        : props.column?.getFacetedMinMaxValues();
    const selectedValues = () => isValueBased()
        ? (props.column?.getFilterValue() ?? []) as any[]
        : (props.column?.getFilterValue() ?? []) as [number, number];

    const [popoverOpen, setPopoverOpen] = createSignal<boolean>(false);
    const [editingWithNumberInputs, setEditingWithNumberInputs] = createSignal<boolean>(false);
    let sliderEditMin!: HTMLInputElement | null;
    let sliderEditMax!: HTMLInputElement | null;

    return (
        <Popover placement="bottom-start" open={popoverOpen()}
                 onOpenChange={(open) => {
                     setPopoverOpen(open);
                     setEditingWithNumberInputs(false);
                 }}>
            <PopoverTrigger as={Button<"button">} variant="outline" size="sm" class={`h-8 border-dashed ${selectedValues().length ? "border-muted-foreground" : ""}`}
                            onclick={() => setPopoverOpen(!popoverOpen())}
            >
                <IconCirclePlus/>
                {props.title}
                <Show when={selectedValues().length}>
                    <Separator orientation="vertical" class="mx-2 h-4"/>
                    <Show when={isValueBased()} fallback={
                        <FilterBadge values={selectedValues} table={props.table} column={props.column}>
                            {selectedValues()[0] + "~" + selectedValues()[1]}
                        </FilterBadge>
                    }>
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
                                    {(option) =>
                                        <FilterBadge values={selectedValues} table={props.table} column={props.column}
                                                     option={option as string}>
                                            {option}
                                        </FilterBadge>
                                    }
                                </For>
                            </Show>
                        </div>
                    </Show>
                </Show>
            </PopoverTrigger>
            <PopoverContent class="w-[250px] p-0">
                <Show when={isValueBased()} fallback={
                    <Card>
                        <Slider
                            minValue={(facets() as [number, number])[0]}
                            maxValue={(facets() as [number, number])[1]}
                            defaultValue={
                                (selectedValues().length ? selectedValues() : facets()) as [number, number]
                            }
                            getValueLabel={(params) => `${params.values[0]} - ${params.values[1]}`}
                            class="space-y-3"
                            onChangeEnd={(vals) => {
                                props.column?.setFilterValue(vals as [number, number])
                                ensurePagesVisible(props.table);
                            }}
                        >
                            <CardTitle class="flex flex-col w-full py-2 px-2">
                                <div class="flex flex-row w-full justify-between">
                                    <SliderLabel>Range</SliderLabel>
                                    <SliderValueLabel
                                        class={`${editingWithNumberInputs() ? "" : "underline "}decoration-1 decoration-dashed`}
                                        onclick={() => setEditingWithNumberInputs(true)}
                                    />
                                </div>
                            </CardTitle>
                            <CardContent class="w-full px-4">
                                <Show when={editingWithNumberInputs()}>
                                    <div class="flex flex-row w-full justify-center">
                                        <NumberField class="w-24"
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
                                        <NumberField class="w-24"
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
                                                if (isNaN(min) || isNaN(max)) {
                                                    console.log("Got non-numeric inputs. This should not happen! Please report it if you see this.",
                                                        sliderEditMin.value, sliderEditMax.value)
                                                } else {
                                                    props.column?.setFilterValue([min, max]);
                                                    ensurePagesVisible(props.table);
                                                }
                                            }
                                            setPopoverOpen(false);
                                            setEditingWithNumberInputs(false);
                                        }}><IconCheck/></Button>
                                    </div>
                                </Show>
                                <SliderTrack class={`${editingWithNumberInputs() ? "hidden" : ""}`}>
                                    <SliderFill/>
                                    <SliderThumb/>
                                    <SliderThumb/>
                                </SliderTrack>
                            </CardContent>
                        </Slider>
                    </Card>
                }>
                    <Command>
                        <CommandInput placeholder={props.title}/>
                        <CommandGroup>
                            <CommandItem>

                            </CommandItem>
                        </CommandGroup>
                        <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            <CommandGroup>
                                <For each={props.options as ValueBasedOption[]}>
                                    {(option) => {
                                        const isSelected = () => selectedValues().includes(option.value)
                                        return (
                                            <CommandItem
                                                onSelect={() => {
                                                    let newValues
                                                    if (isSelected()) {
                                                        newValues = selectedValues().filter((item) => item !== option.value)
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
                                                    {(Icon) => <Icon class="mr-2 size-4 text-muted-foreground"/>}
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
                            <Show when={selectedValues().length > 0}>
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
            </PopoverContent>
        </Popover>
    )
}
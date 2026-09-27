/**
 * PlayerPicker.tsx — searchable picker over a fixed set of BitCraft players, styled after
 * `FilterBuilder`'s `OptionPicker` but simpler: every tick publishes immediately, since there's no
 * shared leaf row to tear this popover down out from under an in-progress pick.
 *
 * `ClaimPicker` (below) shares the same popover/search/list shell via the unexported generic
 * `EntityPicker` — the only thing that differs between the two is which field of the caller's
 * option shape is the id (`playerId` vs `claimId`) and the placeholder text, both supplied by each
 * thin wrapper rather than duplicating the ~90-line shell.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineCheck as IconCheck} from "solid-icons/tb";
import {createMemo, createSignal, For, type JSX, Show} from "solid-js";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "~/components/ui/command";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {cn} from "~/lib/utils";

export interface PlayerOption {
    playerId: string;
    name: string;
}

export interface ClaimOption {
    claimId: string;
    name: string;
}

interface EntityOption {
    id: string;
    name: string;
}

const MAX_VISIBLE_OPTIONS = 100;

function EntityPicker(props: {
    options: EntityOption[];
    selected: string[];
    onChange: (ids: string[]) => void;
    /** Multiselect (toggle membership, stay open) vs. single-select (replace, close on pick). */
    multiple: boolean;
    searchPlaceholder: string;
    selectManyPlaceholder: JSX.Element;
    selectOnePlaceholder: JSX.Element;
}) {
    const [search, setSearch] = createSignal("");
    const [open, setOpen] = createSignal(false);

    const nameFor = (id: string) => props.options.find(o => o.id === id)?.name ?? id;

    /**
     * Visible options, ranked so the ones someone is actually looking for surface first.
     */
    const matches = createMemo(() => {
        const needle = search().toLowerCase().trim();
        const selected = new Set(props.selected);
        const bucket = (option: EntityOption): number => {
            if (needle) {
                if (option.name.toLowerCase() === needle) return 0;
                return selected.has(option.id) ? 1 : 2;
            }
            return selected.has(option.id) ? 0 : 1;
        };
        const visible = needle ? props.options.filter(o => o.name.toLowerCase().includes(needle)) : props.options;
        return visible
            .map((option, index) => ({option, index, bucket: bucket(option)}))
            .sort((a, b) => a.bucket - b.bucket || a.index - b.index)
            .slice(0, MAX_VISIBLE_OPTIONS)
            .map(({option}) => option);
    });

    const pick = (id: string) => {
        if (props.multiple) {
            const selected = props.selected;
            props.onChange(selected.includes(id) ? selected.filter(existing => existing !== id) : [...selected, id]);
            return;
        }
        props.onChange(props.selected.includes(id) ? [] : [id]);
        setOpen(false);
    };

    return (
        <Popover open={open()} onOpenChange={setOpen}>
            <PopoverTrigger as={Button<"button">} variant="outline" class="h-auto min-h-9 min-w-48 flex-1 justify-start py-1.5 font-normal whitespace-normal">
                <Show when={props.selected.length > 0} fallback={<span class="text-muted-foreground">{props.multiple ? props.selectManyPlaceholder : props.selectOnePlaceholder}</span>}>
                    <Show when={props.multiple} fallback={<span>{nameFor(props.selected[0])}</span>}>
                        <span class="flex flex-wrap gap-1">
                            <For each={props.selected.slice(0, 3)}>
                                {id => <Badge variant="secondary">{nameFor(id)}</Badge>}
                            </For>
                            <Show when={props.selected.length > 3}>
                                <Badge variant="secondary">+{props.selected.length - 3}</Badge>
                            </Show>
                        </span>
                    </Show>
                </Show>
            </PopoverTrigger>
            <PopoverContent class="w-64 p-0">
                <Command shouldFilter={false}>
                    <CommandInput placeholder={props.searchPlaceholder} value={search()} onValueChange={setSearch}/>
                    <CommandList>
                        <CommandEmpty><Trans>No matches.</Trans></CommandEmpty>
                        <CommandGroup>
                            <For each={matches()}>
                                {option => (
                                    <CommandItem value={option.id} onSelect={() => pick(option.id)}>
                                        <div class={cn(
                                            "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                            props.selected.includes(option.id) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                                        )}>
                                            <IconCheck/>
                                        </div>
                                        <span>{option.name}</span>
                                    </CommandItem>
                                )}
                            </For>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function PlayerPicker(props: {
    options: PlayerOption[];
    selected: string[];
    onChange: (playerIds: string[]) => void;
    /** Multiselect (toggle membership, stay open) vs. single-select (replace, close on pick). Defaults to `true`. */
    multiple?: boolean;
}) {
    const {_} = useLingui();
    return (
        <EntityPicker
            options={props.options.map(o => ({id: o.playerId, name: o.name}))}
            selected={props.selected}
            onChange={props.onChange}
            multiple={props.multiple ?? true}
            searchPlaceholder={_(msg`Search players…`)}
            selectManyPlaceholder={<Trans>Select players…</Trans>}
            selectOnePlaceholder={<Trans>Select player…</Trans>}
        />
    );
}

/** Always single-select — a claim-membership loyalty rule only ever names one claim. */
export function ClaimPicker(props: {
    options: ClaimOption[];
    selected: string[];
    onChange: (claimIds: string[]) => void;
}) {
    const {_} = useLingui();
    return (
        <EntityPicker
            options={props.options.map(o => ({id: o.claimId, name: o.name}))}
            selected={props.selected}
            onChange={props.onChange}
            multiple={false}
            searchPlaceholder={_(msg`Search claims…`)}
            selectManyPlaceholder={<Trans>Select claims…</Trans>}
            selectOnePlaceholder={<Trans>Select claim…</Trans>}
        />
    );
}

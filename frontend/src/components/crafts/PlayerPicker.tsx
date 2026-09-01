/**
 * PlayerPicker.tsx — searchable picker over a fixed set of BitCraft players, styled after
 * `FilterBuilder`'s `OptionPicker` but simpler: every tick publishes immediately, since there's no
 * shared leaf row to tear this popover down out from under an in-progress pick.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineCheck as IconCheck} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "~/components/ui/command";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {cn} from "~/lib/utils";

export interface PlayerOption {
    playerId: string;
    name: string;
}

const MAX_VISIBLE_OPTIONS = 100;

export function PlayerPicker(props: {
    options: PlayerOption[];
    selected: string[];
    onChange: (playerIds: string[]) => void;
    /** Multiselect (toggle membership, stay open) vs. single-select (replace, close on pick). Defaults to `true`. */
    multiple?: boolean;
}) {
    const {_} = useLingui();
    const [search, setSearch] = createSignal("");
    const [open, setOpen] = createSignal(false);
    const multiple = () => props.multiple ?? true;

    const nameFor = (playerId: string) => props.options.find(o => o.playerId === playerId)?.name ?? playerId;

    /**
     * Visible options, ranked so the ones someone is actually looking for surface first.
     */
    const matches = createMemo(() => {
        const needle = search().toLowerCase().trim();
        const selected = new Set(props.selected);
        const bucket = (option: PlayerOption): number => {
            if (needle) {
                if (option.name.toLowerCase() === needle) return 0;
                return selected.has(option.playerId) ? 1 : 2;
            }
            return selected.has(option.playerId) ? 0 : 1;
        };
        const visible = needle ? props.options.filter(o => o.name.toLowerCase().includes(needle)) : props.options;
        return visible
            .map((option, index) => ({option, index, bucket: bucket(option)}))
            .sort((a, b) => a.bucket - b.bucket || a.index - b.index)
            .slice(0, MAX_VISIBLE_OPTIONS)
            .map(({option}) => option);
    });

    const pick = (playerId: string) => {
        if (multiple()) {
            const selected = props.selected;
            props.onChange(selected.includes(playerId) ? selected.filter(id => id !== playerId) : [...selected, playerId]);
            return;
        }
        props.onChange(props.selected.includes(playerId) ? [] : [playerId]);
        setOpen(false);
    };

    return (
        <Popover open={open()} onOpenChange={setOpen}>
            <PopoverTrigger as={Button<"button">} variant="outline" class="h-auto min-h-9 min-w-48 flex-1 justify-start py-1.5 font-normal whitespace-normal">
                <Show
                    when={props.selected.length > 0}
                    fallback={<span class="text-muted-foreground">{multiple() ? <Trans>Select players…</Trans> : <Trans>Select player…</Trans>}</span>}
                >
                    <Show when={multiple()} fallback={<span>{nameFor(props.selected[0])}</span>}>
                        <span class="flex flex-wrap gap-1">
                            <For each={props.selected.slice(0, 3)}>
                                {playerId => <Badge variant="secondary">{nameFor(playerId)}</Badge>}
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
                    <CommandInput placeholder={_(msg`Search players…`)} value={search()} onValueChange={setSearch}/>
                    <CommandList>
                        <CommandEmpty><Trans>No matches.</Trans></CommandEmpty>
                        <CommandGroup>
                            <For each={matches()}>
                                {option => (
                                    <CommandItem value={option.playerId} onSelect={() => pick(option.playerId)}>
                                        <div class={cn(
                                            "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                            props.selected.includes(option.playerId) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
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

/**
 * SlotPicker — search box + result list for choosing one entry from a fixed option set.
 * Same look and keyboard handling (↑/↓, Enter, Escape) as `GlobalSearchInput`'s picker mode, but
 * searches only the given options.
 */

import type {Rarity} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import Fuse from "fuse.js";
import {TbOutlineSearch as IconSearch} from "solid-icons/tb";
import {createMemo, createSignal, For, type JSX, onMount, Show} from "solid-js";
import {TierIcon} from "~/components/shared/GameIcon";
import {Rarities} from "~/lib/bitcraft-utils";
import {cn} from "~/lib/utils";

export interface PickerOption {
    id: number;
    name: string;
    tier?: number;
    rarity?: Rarity;
    /** Renders the icon shown on the slot button once this option is selected. */
    icon: () => JSX.Element;
}

const MAX_RESULTS = 50;

export function SlotPicker(props: {
    options: PickerOption[];
    /** Label of the first row, which clears the slot. */
    clearLabel: string;
    /** `keepOpen` is true for shift+click / shift+Enter. */
    onSelect: (option: PickerOption | undefined, keepOpen: boolean) => void;
}) {
    const {_} = useLingui();
    const [query, setQuery] = createSignal("");
    const [active, setActive] = createSignal(0);
    let input: HTMLInputElement | undefined;

    const fuse = createMemo(() => new Fuse(props.options, {keys: ["name"], threshold: 0.3, ignoreLocation: true}));
    const results = createMemo((): PickerOption[] => {
        const q = query().trim();
        return q ? fuse().search(q, {limit: MAX_RESULTS}).map(r => r.item) : props.options;
    });
    // Row 0 clears the slot; results follow.
    const rowCount = () => results().length + 1;
    const choose = (row: number, keepOpen: boolean) => props.onSelect(row === 0 ? undefined : results()[row - 1], keepOpen);

    onMount(() => queueMicrotask(() => input?.focus()));

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(i => Math.min(i + 1, rowCount() - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            choose(query().trim() && active() === 0 ? 1 : active(), e.shiftKey);
        }
    };

    const rowClass = (i: number) => cn(
        "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        active() === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
    );

    return (
        <div class="flex flex-col gap-1">
            <div class="relative">
                <IconSearch class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                <input
                    ref={input}
                    type="search"
                    autocomplete="off"
                    placeholder={_(msg`Search...`)}
                    aria-label={_(msg`Search...`)}
                    class="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
                    onInput={e => {
                        setQuery(e.currentTarget.value);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                />
            </div>
            <ul class="max-h-80 overflow-y-auto py-1" role="listbox">
                <li role="option" aria-selected={active() === 0}>
                    <button type="button" class={cn(rowClass(0), "text-muted-foreground")} onClick={e => choose(0, e.shiftKey)} onMouseEnter={() => setActive(0)}>
                        {props.clearLabel}
                    </button>
                </li>
                <For each={results()}>
                    {(option, i) => (
                        <li role="option" aria-selected={active() === i() + 1}>
                            <button type="button" class={rowClass(i() + 1)} onClick={e => choose(i() + 1, e.shiftKey)} onMouseEnter={() => setActive(i() + 1)}>
                                <span class={cn(
                                    "inline-flex items-center gap-1.5 truncate rounded-sm px-1 font-medium",
                                    option.rarity && `border ${Rarities.getBorderColorClass(option.rarity)}`,
                                )}>
                                    <Show when={option.tier} keyed>{tier => <TierIcon tier={tier}/>}</Show>
                                    {option.name}
                                </span>
                            </button>
                        </li>
                    )}
                </For>
            </ul>
        </div>
    );
}

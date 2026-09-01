/**
 * FilterBuilder.tsx — the visual editor for a `FilterNode` tree.
 *
 * Purely a view over the engine in `@brico/crafts/filter`: it never decides what "matches", it only
 * builds trees. Every edit produces a *new* tree handed back through `onChange`, so the page owns
 * the state and a saved filter is exactly the value the builder was editing.
 *
 * Value options are injected via `options` rather than read from the game tables here, for the same
 * reason the engine takes a `labelFor` callback: which claims and players exist depends on the live
 * relay connection, which is the page's business, not this component's.
 */
import type {Rarity} from "@brico/bitcraft-bindings/types";
import {
    type Comparator,
    FIELDS,
    FILTER_FIELDS,
    type FilterField,
    type FilterLeaf,
    type FilterNode,
    type FilterValue,
    isLeaf,
    type Quantifier,
    QUANTIFIERS,
    validateFilter,
} from "@brico/crafts/filter";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {
    TbOutlineCheck as IconCheck,
    TbOutlineCirclePlus as IconAdd,
    TbOutlineClipboard as IconPaste,
    TbOutlineClipboardCheck as IconClipboardCheck,
    TbOutlineClipboardX as IconClipboardX,
    TbOutlineCopy as IconCopy,
    TbOutlineTrash as IconRemove,
} from "solid-icons/tb";
import {createMemo, createSignal, For, Match, Show, Switch} from "solid-js";
import {TierIcon} from "~/components/shared/GameIcon";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "~/components/ui/command";
import {NumberField, NumberFieldGroup, NumberFieldInput} from "~/components/ui/number-field";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch as Toggle, SwitchControl as ToggleControl, SwitchLabel as ToggleLabel, SwitchThumb as ToggleThumb} from "~/components/ui/switch";
import {Rarities} from "~/lib/bitcraft-utils";
import {ConditionPhrase} from "~/lib/crafts/filter-condition";
import {cmpLabel, fieldLabel, quantifierLabel} from "~/lib/crafts/filter-vocab";
import {useLabel} from "~/lib/labels";
import {useSettings} from "~/lib/settings";
import {cn, useCopy} from "~/lib/utils";

/**
 * One selectable value for a field.
 *
 * `tier`/`rarity` are optional game decoration, and they are load-bearing rather than pretty: an
 * item's *name* is not unique across the recipes that produce it. Ten different item-list outputs
 * are all called "Empty Bucket", one per tier of input plank, and a list of ten identical strings
 * is unusable — worse, `Command` keys its rows by their text, so hovering one highlights all ten.
 * The tier badge and rarity border tell them apart; a distinct `value` on the row fixes the
 * highlighting. Carried as plain data, not JSX, so an option list stays a serializable value.
 *
 * `active` marks an option that currently has at least one live craft — set by callers that have a
 * live relay to check against (the browser), left `undefined` (equivalent to `false`) by callers
 * that don't (the bounty rule builder). It only ever affects `OptionPicker`'s sort order, never
 * which options are offered — see its doc comment.
 */
export type FieldOption = {value: FilterValue; label: string; tier?: number; rarity?: Rarity; active?: boolean};

/**
 * Selectable values for a field, or `undefined` when the field is open-ended (effort amounts have
 * no enumerable set) and should be typed in instead.
 */
export type FieldOptions = (field: FilterField) => FieldOption[] | undefined;

/** Comparators whose value is a list rather than a scalar. */
function wantsListValue(cmp: Comparator): boolean {
    return cmp === "in" || cmp === "notIn" || cmp === "all";
}

/** How many options to render at once, so an item picker over thousands of rows stays responsive. */
const MAX_VISIBLE_OPTIONS = 200;

/**
 * Marks a single condition row. Behavioral, not cosmetic: `RawValueEditor` needs to know whether
 * focus is leaving for a sibling control in the same row before it decides to commit.
 */
const ROW_MARKER = "data-filter-row";
const ROW_SELECTOR = `[${ROW_MARKER}]`;

// ── Group normalization ───────────────────────────────────────

/**
 * The editable shape of a non-leaf node: and/or plus a negation flag, rather than the engine's
 * separate `not` wrapper. Collapsing the two means "not" is a checkbox on a group the user already
 * sees, instead of a third kind of box nested around it.
 */
type GroupView = {negated: boolean; op: "and" | "or"; children: FilterNode[]};

/** The `GroupView` for a node, or `null` when it is a leaf and needs `LeafRow` instead. */
function asGroup(node: FilterNode): GroupView | null {
    if (isLeaf(node)) return null;
    if (node.op !== "not") return {negated: false, op: node.op, children: node.children};
    const inner = node.child;
    // `not(and(x))` ≡ `not(x)`, so a negation wrapping anything that isn't a plain group (a bare
    // leaf, or a second negation) is shown as a negated one-child group. Meaning is preserved; only
    // the tree gains a redundant `and`, which the engine evaluates identically.
    return !isLeaf(inner) && inner.op !== "not"
        ? {negated: true, op: inner.op, children: inner.children}
        : {negated: true, op: "and", children: [inner]};
}

function fromGroup(group: GroupView): FilterNode {
    const inner: FilterNode = {op: group.op, children: group.children};
    return group.negated ? {op: "not", child: inner} : inner;
}

function defaultValueFor(field: FilterField, cmp: Comparator, options: FieldOptions): FilterValue | FilterValue[] {
    if (wantsListValue(cmp)) return [];
    const kind = FIELDS[field].kind;
    // A boolean field has no option list to draw a first value from, and "yes" is the reading people
    // mean when they add a "Public" condition and stop there. Which literal spells "yes" depends on
    // the comparator carried over from the previous field, so it can't just be `true`.
    if (kind === "bool") return cmp !== "neq";
    return options(field)?.[0]?.value ?? (kind === "id" || kind === "tag" ? "" : 0);
}

/** A fresh leaf on `field`, with a `quantifier` exactly when the field needs one. */
function leafFor(field: FilterField, cmp: Comparator, options: FieldOptions, quantifier?: Quantifier): FilterLeaf {
    return {
        field,
        cmp,
        value: defaultValueFor(field, cmp, options),
        ...(FIELDS[field].quantified ? {quantifier: quantifier ?? "any"} : {}),
    };
}

function newLeaf(options: FieldOptions, disallowedFields?: readonly FilterField[]): FilterLeaf {
    const field = disallowedFields?.includes("region") ? FILTER_FIELDS.find(f => !disallowedFields.includes(f))! : "region";
    return leafFor(field, "eq", options);
}

// ── Value editors ─────────────────────────────────────────────

/** The rarity border an option carries, if any — the same colour the item's icon frame uses. */
function borderFor(option: FieldOption | undefined): string {
    return option?.rarity ? `border ${Rarities.getBorderColorClass(option.rarity)}` : "";
}

/** An option's text, preceded by its tier badge when it has one. */
function OptionLabel(props: {option: FieldOption | undefined; fallback: string}) {
    return (
        <>
            <Show when={props.option?.tier} keyed>
                {tier => <TierIcon tier={tier}/>}
            </Show>
            <span>{props.option?.label ?? props.fallback}</span>
        </>
    );
}

/** Searchable single/multi picker over a known option set. */
function OptionPicker(props: {
    options: FieldOption[];
    selected: FilterValue[];
    multiple: boolean;
    placeholder: string;
    onChange: (values: FilterValue[]) => void;
}) {
    const [search, setSearch] = createSignal("");
    const [open, setOpen] = createSignal(false);

    /**
     * Ticks made while the popover is open, held back until it closes.
     *
     * Publishing each tick immediately replaces the leaf, and `GroupEditor`'s `For` then rebuilds
     * the row, taking this popover down with it.
     */
    const [draft, setDraft] = createSignal<FilterValue[] | null>(null);
    const current = () => draft() ?? props.selected;

    /**
     * Visible options, ranked so the ones someone is actually looking for surface first.
     *
     * No search term: selected first, then unselected options with a live craft, then the rest.
     * With a search term: an exact (still case-insensitive) label match first regardless of
     * selection, then selected partial matches, then everything else that contains the term —
     * `active` stops mattering once there's a term to filter by. Each bucket keeps `options`' own
     * order (already alphabetical, from every caller), so this only re-groups, never re-sorts.
     */
    const matches = createMemo(() => {
        const needle = search().toLowerCase().trim();
        const selected = new Set(current());
        const bucket = (option: FieldOption): number => {
            if (needle) {
                if (option.label.toLowerCase() === needle) return 0;
                return selected.has(option.value) ? 1 : 2;
            }
            if (selected.has(option.value)) return 0;
            return option.active ? 1 : 2;
        };
        const visible = needle ? props.options.filter(o => o.label.toLowerCase().includes(needle)) : props.options;
        return visible
            .map((option, index) => ({option, index, bucket: bucket(option)}))
            .sort((a, b) => a.bucket - b.bucket || a.index - b.index)
            .slice(0, MAX_VISIBLE_OPTIONS)
            .map(({option}) => option);
    });

    const optionFor = (value: FilterValue) => props.options.find(o => o.value === value);

    const toggle = (value: FilterValue) => {
        if (!props.multiple) {
            props.onChange([value]);
            setOpen(false);
            return;
        }
        const chosen = current();
        setDraft(chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value]);
    };

    const setOpenState = (isOpen: boolean) => {
        setOpen(isOpen);
        if (isOpen) return;
        const pending = draft();
        setDraft(null);
        if (pending) props.onChange(pending);
    };

    return (
        <Popover open={open()} onOpenChange={setOpenState}>
            <PopoverTrigger as={Button<"button">} variant="outline" class="h-9 min-w-40 justify-start font-normal">
                <Show when={current().length > 0} fallback={<span class="text-muted-foreground">{props.placeholder}</span>}>
                    <span class="flex flex-wrap gap-1">
                        <For each={current().slice(0, 3)}>
                            {value => (
                                <Badge variant="secondary" class={cn("gap-1", borderFor(optionFor(value)))}>
                                    <OptionLabel option={optionFor(value)} fallback={String(value)}/>
                                </Badge>
                            )}
                        </For>
                        <Show when={current().length > 3}>
                            <Badge variant="secondary">+{current().length - 3}</Badge>
                        </Show>
                    </span>
                </Show>
            </PopoverTrigger>
            <PopoverContent class="w-64 p-0">
                <Command shouldFilter={false}>
                    <CommandInput placeholder={props.placeholder} value={search()} onValueChange={setSearch}/>
                    <CommandList>
                        <CommandEmpty><Trans>No matches.</Trans></CommandEmpty>
                        <CommandGroup>
                            <For each={matches()}>
                                {option => (
                                    // `value` defaults to the row's text, and `Command` treats two
                                    // rows with the same value as the same row — hovering one of
                                    // the ten "Empty Bucket" items highlighted all ten. The option
                                    // value is unique by construction, so key on that instead.
                                    <CommandItem value={String(option.value)} onSelect={() => toggle(option.value)}>
                                        <div class={cn(
                                            "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                            current().includes(option.value) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                                        )}>
                                            <IconCheck/>
                                        </div>
                                        <span class={cn("flex items-center gap-1.5 rounded-sm px-1", borderFor(option))}>
                                            <OptionLabel option={option} fallback={option.label}/>
                                        </span>
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

/**
 * The whole editor for a boolean condition: `yes ( ) no`, with no comparator picker.
 */
function BoolValueEditor(props: {label: string; value: boolean; onChange: (value: boolean) => void}) {
    const side = (yes: boolean) => cn("cursor-pointer", props.value === yes ? "text-foreground" : "text-muted-foreground");
    return (
        <Toggle
            class="flex h-9 items-center gap-2"
            aria-label={props.label}
            checked={props.value}
            onChange={props.onChange}
        >
            <ToggleLabel class={side(false)}><Trans>No</Trans></ToggleLabel>
            <ToggleControl><ToggleThumb/></ToggleControl>
            <ToggleLabel class={side(true)}><Trans>Yes</Trans></ToggleLabel>
        </Toggle>
    );
}

/** Free-form entry for open-ended fields: one value, or a comma-separated list. */
function RawValueEditor(props: {leaf: FilterLeaf; onChange: (value: FilterValue | FilterValue[]) => void}) {
    // Both are free-form strings, not numbers — a "tag" just isn't 18 digits long like an id is.
    const isId = () => FIELDS[props.leaf.field].kind === "id" || FIELDS[props.leaf.field].kind === "tag";

    /**
     * What the number field currently reads, held back from the filter until the user leaves it.
     *
     * Publishing on every keystroke replaces the leaf, and `GroupEditor`'s `For` rebuilds the row
     * around a brand-new `<input>`.
     */
    const [draft, setDraft] = createSignal<number | null>(null);
    const commitNumber = (e: FocusEvent) => {
        // Clicking another control in this same row moves focus here *first*, while the click is
        // still in flight. Committing at that moment rebuilds the row and destroys the element the
        // click was traveling towards, so it never lands — "Remove condition" needed two presses.
        // Deferring is safe: every control in a row either replaces this value (the field and
        // comparator pickers) or throws the whole leaf away (remove).
        const movingTo = e.relatedTarget;
        if (movingTo instanceof Node && (e.currentTarget as HTMLElement).closest(ROW_SELECTOR)?.contains(movingTo)) return;
        const value = draft();
        setDraft(null);
        if (value !== null && value !== props.leaf.value) props.onChange(value);
    };

    /** Enter should apply the value without making the user click away first. */
    const commitOnEnter = (e: KeyboardEvent) => {
        if (e.key === "Enter") (e.target as HTMLElement).blur();
    };

    return (
        <Show
            when={Array.isArray(props.leaf.value)}
            fallback={
                <Show
                    when={!isId()}
                    fallback={
                        <input
                            class="h-9 w-44 rounded-md border border-input bg-transparent px-3 text-sm"
                            value={String(props.leaf.value)}
                            // `change`, not `input`, for the same reason as the number field above
                            onChange={e => props.onChange(e.currentTarget.value)}
                        />
                    }
                >
                    <NumberField
                        class="w-28"
                        rawValue={Number(props.leaf.value)}
                        onRawValueChange={raw => setDraft(Number.isFinite(raw) ? raw : 0)}
                    >
                        <NumberFieldGroup onFocusOut={commitNumber} onKeyDown={commitOnEnter}>
                            <NumberFieldInput class="h-9"/>
                        </NumberFieldGroup>
                    </NumberField>
                </Show>
            }
        >
            <input
                class="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
                value={(props.leaf.value as FilterValue[]).join(", ")}
                onChange={e => {
                    const parts = e.currentTarget.value.split(",").map(part => part.trim()).filter(Boolean);
                    props.onChange(isId() ? parts : parts.map(Number).filter(Number.isFinite));
                }}
            />
        </Show>
    );
}

/**
 * The `payout` field's numeric value editor — a `gte`/`lte` threshold on `CraftSubject.payout`,
 * which is always stored currency-per-effort (see its doc comment), typed/shown in whichever
 * direction `~/lib/settings`'s shared `payoutDisplayMode` currently prefers. Only the display and
 * the number typed here go through the mode; the leaf's own `value` is always the engine's fixed
 * currency-per-effort float, same as ever.
 */
function PayoutValueEditor(props: {leaf: FilterLeaf; onChange: (value: number) => void}) {
    const {_} = useLingui();
    const settings = useSettings();
    const mode = settings.payoutDisplayMode;
    const stored = () => Number(props.leaf.value);
    const displayValue = () => mode() === "effortPerCurrency" ? (stored() > 0 ? 1 / stored() : 0) : stored();

    const [draft, setDraft] = createSignal<number | null>(null);
    const commit = (e: FocusEvent) => {
        // Same "wait for focus to actually leave the row" reasoning as `RawValueEditor.commitNumber`.
        const movingTo = e.relatedTarget;
        if (movingTo instanceof Node && (e.currentTarget as HTMLElement).closest(ROW_SELECTOR)?.contains(movingTo)) return;
        const raw = draft();
        setDraft(null);
        if (raw === null) return;
        const engineValue = mode() === "effortPerCurrency" ? (raw > 0 ? 1 / raw : 0) : raw;
        if (engineValue !== stored()) props.onChange(engineValue);
    };
    const commitOnEnter = (e: KeyboardEvent) => {
        if (e.key === "Enter") (e.target as HTMLElement).blur();
    };

    return (
        <div class="flex items-center gap-1">
            <NumberField
                class="w-28"
                rawValue={draft() ?? displayValue()}
                onRawValueChange={raw => setDraft(Number.isFinite(raw) ? raw : 0)}
            >
                <NumberFieldGroup onFocusOut={commit} onKeyDown={commitOnEnter}>
                    <NumberFieldInput class="h-9"/>
                </NumberFieldGroup>
            </NumberField>
            <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground hover:underline"
                title={_(msg`Switch between currency/effort and effort/currency`)}
                onClick={() => settings.setPayoutDisplayMode(mode() === "currencyPerEffort" ? "effortPerCurrency" : "currencyPerEffort")}
            >
                {mode() === "currencyPerEffort" ? <Trans>currency/effort</Trans> : <Trans>effort/currency</Trans>}
            </button>
        </div>
    );
}

// ── Rows ──────────────────────────────────────────────────────

function LeafRow(props: {
    leaf: FilterLeaf;
    options: FieldOptions;
    disallowedFields?: readonly FilterField[];
    onChange: (leaf: FilterLeaf) => void;
    onRemove: () => void;
}) {
    const {_} = useLingui();
    const label = useLabel();
    const fieldChoices = () => FILTER_FIELDS.filter(field => !props.disallowedFields?.includes(field));
    const meta = () => FIELDS[props.leaf.field];
    const fieldOptions = () => props.options(props.leaf.field);
    const wantsList = () => wantsListValue(props.leaf.cmp);
    const isBool = () => meta().kind === "bool";
    const isQuantified = () => meta().quantified === true;

    // `is yes` and `is not no` are the same condition; both display as "yes". Written back as `is`,
    // so editing one of the redundant spellings quietly normalizes it.
    const boolValue = () => (props.leaf.cmp === "eq") === (props.leaf.value === true);
    const setBoolValue = (value: boolean) => props.onChange({...props.leaf, cmp: "eq", value});

    const setField = (field: FilterField) => {
        // The new field may not support the current comparator (a claim has no "at least"), and its
        // values come from a different domain entirely, so both are reset rather than carried over.
        const cmp = FIELDS[field].comparators.includes(props.leaf.cmp) ? props.leaf.cmp : "eq";
        props.onChange(leafFor(field, cmp, props.options, props.leaf.quantifier));
    };

    const setQuantifier = (quantifier: Quantifier) => props.onChange({...props.leaf, quantifier});

    const setCmp = (cmp: Comparator) => {
        const wasList = Array.isArray(props.leaf.value);
        const nowList = wantsListValue(cmp);
        // Switching between a scalar and a list comparator keeps whatever was already chosen, so
        // "tier is 4" → "tier is any of [4]" doesn't silently throw the 4 away.
        const value = wasList === nowList
            ? props.leaf.value
            : nowList
                ? [props.leaf.value as FilterValue]
                : (props.leaf.value as FilterValue[])[0] ?? defaultValueFor(props.leaf.field, cmp, props.options);
        props.onChange({...props.leaf, cmp, value});
    };

    const FieldSelect = () => (
        <Select
            value={props.leaf.field}
            onChange={value => value && setField(value)}
            options={fieldChoices()}
            itemComponent={itemProps => <SelectItem item={itemProps.item}>{label(fieldLabel(itemProps.item.rawValue as FilterField))}</SelectItem>}
        >
            <SelectTrigger class="h-9 min-w-30 max-w-60">
                <SelectValue<FilterField> class="mr-2">{state => label(fieldLabel(state.selectedOption()))}</SelectValue>
            </SelectTrigger>
            <SelectContent/>
        </Select>
    );

    const QuantifierSelect = () => (
        <Select
            value={props.leaf.quantifier ?? "any"}
            onChange={value => value && setQuantifier(value)}
            options={[...QUANTIFIERS]}
            itemComponent={itemProps => <SelectItem item={itemProps.item}>{label(quantifierLabel(itemProps.item.rawValue as Quantifier))}</SelectItem>}
        >
            <SelectTrigger class="h-9 w-24">
                <SelectValue<Quantifier>>{state => label(quantifierLabel(state.selectedOption()))}</SelectValue>
            </SelectTrigger>
            <SelectContent/>
        </Select>
    );

    const CmpSelect = () => (
        <Select
            value={props.leaf.cmp}
            onChange={value => value && setCmp(value)}
            options={[...meta().comparators]}
            itemComponent={itemProps => <SelectItem item={itemProps.item}>{label(cmpLabel(itemProps.item.rawValue as Comparator))}</SelectItem>}
        >
            <SelectTrigger class="h-9 w-32">
                <SelectValue<Comparator>>{state => label(cmpLabel(state.selectedOption()))}</SelectValue>
            </SelectTrigger>
            <SelectContent/>
        </Select>
    );

    const ValueEditor = () => (
        <Switch
            fallback={<RawValueEditor leaf={props.leaf} onChange={value => props.onChange({...props.leaf, value})}/>}
        >
            <Match when={props.leaf.field === "payout" && !wantsList()}>
                <PayoutValueEditor leaf={props.leaf} onChange={value => props.onChange({...props.leaf, value})}/>
            </Match>
            <Match when={fieldOptions()}>
                {options => (
                    <OptionPicker
                        options={options()}
                        multiple={wantsList()}
                        placeholder={_(msg`Choose ${label(fieldLabel(props.leaf.field))}`)}
                        selected={Array.isArray(props.leaf.value) ? props.leaf.value : [props.leaf.value]}
                        onChange={values => props.onChange({
                            ...props.leaf,
                            value: wantsList() ? values : values[0] ?? defaultValueFor(props.leaf.field, props.leaf.cmp, props.options),
                        })}
                    />
                )}
            </Match>
        </Switch>
    );

    return (
        <div {...{[ROW_MARKER]: ""}} class="flex flex-wrap items-center gap-2">
            {/* A boolean's comparator is folded into its yes/no switch — see `BoolValueEditor` — so
                it never goes through `ConditionPhrase`'s "is"/"is not" phrasing at all. Every other
                field reads as a single translatable phrase built from the already-rendered field/
                comparator/value controls (and quantifier, when the field is quantified). */}
            <Switch fallback={
                <ConditionPhrase
                    quantified={isQuantified()}
                    cmp={props.leaf.cmp}
                    quantifier={<QuantifierSelect/>}
                    field={<FieldSelect/>}
                    cmpEl={<CmpSelect/>}
                    value={<ValueEditor/>}
                />
            }>
                <Match when={isBool()}>
                    <FieldSelect/>
                    <BoolValueEditor label={label(fieldLabel(props.leaf.field))} value={boolValue()} onChange={setBoolValue}/>
                </Match>
            </Switch>

            <Button variant="ghost" size="icon" class="size-9" aria-label={_(msg`Remove condition`)} onClick={props.onRemove}>
                <IconRemove class="size-4"/>
            </Button>
        </div>
    );
}

function GroupEditor(props: {
    group: GroupView;
    options: FieldOptions;
    disallowedFields?: readonly FilterField[];
    depth: number;
    onChange: (node: FilterNode) => void;
    onRemove?: () => void;
}) {
    const {_} = useLingui();
    const update = (patch: Partial<GroupView>) => props.onChange(fromGroup({...props.group, ...patch}));
    const replaceChild = (index: number, child: FilterNode) =>
        update({children: props.group.children.map((existing, i) => i === index ? child : existing)});
    const removeChild = (index: number) =>
        update({children: props.group.children.filter((_, i) => i !== index)});
    const append = (child: FilterNode) =>
        update({children: [...props.group.children, child]});

    // Copies this group's own subtree — the root group's copy is the whole filter, since the root
    // is rendered as a group too (see `FilterBuilder`'s doc comment).
    const [copyGroup, groupCopied] = useCopy(() => JSON.stringify(fromGroup(props.group)));

    /**
     * Replaces this whole node (leaf or group) with whatever is on the clipboard, provided it's a
     * valid `FilterNode` on its own — same rule `validateFilter` already applies to every subnode
     * of a pasted top-level import, just entered one level down.
     */
    const [pasteFailed, setPasteFailed] = createSignal(false);
    const pasteGroup = async () => {
        try {
            const raw = JSON.parse(await navigator.clipboard.readText());
            if (validateFilter(raw, "filter", props.disallowedFields).length > 0) throw new Error("invalid filter");
            props.onChange(raw as FilterNode);
        } catch {
            setPasteFailed(true);
            setTimeout(() => setPasteFailed(false), 1500);
        }
    };

    // Spelling out the identity element, because an empty group is not obviously "everything".
    const everyMatches = () => (props.group.op === "and") !== props.group.negated;

    return (
        <div class={cn("space-y-2 rounded-md border border-border p-3", props.depth > 0 && "bg-muted/30", props.group.negated && "border-dashed")}>
            <div class="flex flex-wrap items-center gap-2">
                <Button
                    variant={props.group.negated ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={props.group.negated}
                    onClick={() => update({negated: !props.group.negated})}
                >
                    <Trans>not</Trans>
                </Button>
                <Select
                    value={props.group.op}
                    onChange={value => value && update({op: value})}
                    options={["and", "or"] as const}
                    itemComponent={itemProps => <SelectItem item={itemProps.item}>{itemProps.item.rawValue === "and" ? <Trans>Match all</Trans> : <Trans>Match any</Trans>}</SelectItem>}
                >
                    <SelectTrigger class="h-8 w-32">
                        <SelectValue<"and" | "or">>{state => state.selectedOption() === "and" ? <Trans>Match all</Trans> : <Trans>Match any</Trans>}</SelectValue>
                    </SelectTrigger>
                    <SelectContent/>
                </Select>
                <span class="text-xs text-muted-foreground"><Trans>of the following</Trans></span>
                <div class="ml-auto flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => append(newLeaf(props.options, props.disallowedFields))}>
                        <IconAdd class="mr-1 size-4"/><Trans>Condition</Trans>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => append({op: "or", children: []})}>
                        <IconAdd class="mr-1 size-4"/><Trans>Group</Trans>
                    </Button>
                    <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Copy group as JSON`)} title={_(msg`Copy group as JSON`)} onClick={copyGroup}>
                        <Show when={groupCopied()} fallback={<IconCopy class="size-4"/>}>
                            <IconClipboardCheck class="size-4"/>
                        </Show>
                    </Button>
                    <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Paste group from clipboard`)} title={_(msg`Paste group from clipboard`)} onClick={pasteGroup}>
                        <Show when={pasteFailed()} fallback={<IconPaste class="size-4"/>}>
                            <IconClipboardX class="size-4"/>
                        </Show>
                    </Button>
                    <Show when={props.onRemove}>
                        <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Remove group`)} onClick={() => props.onRemove!()}>
                            <IconRemove class="size-4"/>
                        </Button>
                    </Show>
                </div>
            </div>

            <Show
                when={props.group.children.length > 0}
                fallback={
                    <p class="text-sm text-muted-foreground">
                        <Show when={everyMatches()} fallback={<Trans>No conditions — nothing matches.</Trans>}>
                            <Trans>No conditions — every craft matches.</Trans>
                        </Show>
                    </p>
                }
            >
                <div class="space-y-2">
                    {/* An edit replaces the child object, so `For` rebuilds the whole row around
                        it. That is survivable only because no control in a row publishes while
                        the user is still working in it — see `RawValueEditor` and `OptionPicker`,
                        which both hold a draft and commit on exit. Keep it that way. */}
                    <For each={props.group.children}>
                        {(child, index) => (
                            <NodeEditor
                                node={child}
                                options={props.options}
                                disallowedFields={props.disallowedFields}
                                depth={props.depth + 1}
                                onChange={next => replaceChild(index(), next)}
                                onRemove={() => removeChild(index())}
                            />
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}

/** Renders whichever editor a node needs — a leaf row, or a (possibly negated) group. */
function NodeEditor(props: {
    node: FilterNode;
    options: FieldOptions;
    disallowedFields?: readonly FilterField[];
    depth: number;
    onChange: (node: FilterNode) => void;
    onRemove: () => void;
}) {
    const group = createMemo(() => asGroup(props.node));
    return (
        <Show
            when={group()}
            fallback={
                <LeafRow
                    leaf={props.node as FilterLeaf}
                    options={props.options}
                    disallowedFields={props.disallowedFields}
                    onChange={props.onChange}
                    onRemove={props.onRemove}
                />
            }
        >
            {resolved => (
                <GroupEditor
                    group={resolved()}
                    options={props.options}
                    disallowedFields={props.disallowedFields}
                    depth={props.depth}
                    onChange={props.onChange}
                    onRemove={props.onRemove}
                />
            )}
        </Show>
    );
}

/**
 * Root of the builder. The root is always a group so there is always somewhere to add the first
 * condition; a root that somehow isn't one (a single-leaf filter shared by URL, say) is wrapped
 * rather than rejected.
 */
export function FilterBuilder(props: {node: FilterNode; options: FieldOptions; disallowedFields?: readonly FilterField[]; onChange: (node: FilterNode) => void}) {
    const root = createMemo<GroupView>(() => asGroup(props.node) ?? {negated: false, op: "and", children: [props.node]});
    return <GroupEditor group={root()} options={props.options} disallowedFields={props.disallowedFields} depth={0} onChange={props.onChange}/>;
}

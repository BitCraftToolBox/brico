/**
 * filter.ts — the craft filter engine.
 *
 * Deliberately **framework-free**: no Solid, no SpacetimeDB bindings, no `~/` imports. The same
 * predicate has to run in three places — this frontend's live preview, the future `brico-bot`
 * bridge worker that decides when a watch fires, and any test harness — and the only way those
 * three can be guaranteed to agree on what "matches" is for them to run the *same* code. Keeping
 * the module dependency-free is what makes vendoring it into `brico-bot` a copy rather than a port.
 *
 * A filter is a tree (`FilterNode`) evaluated against a `CraftSubject`, a flat projection of a
 * craft built from the relay tables and static recipe data by `./subject.ts`'s `buildCraftSubject`.
 * The tree is plain JSON so it can be persisted to localStorage today and to a
 * `saved_filter.filter_json` column later without a second serializer.
 */

// ── Fields ────────────────────────────────────────────────────

/** Every property of a craft a filter can test. */
export type FilterField =
    | "region"
    | "claim"
    | "item"
    | "itemTag"
    | "inputItem"
    | "inputItemTag"
    | "skill"
    | "tier"
    | "buildingType"
    | "effortTotal"
    | "effortRemaining"
    | "public"
    | "complete"
    | "owner"
    | "ownerAccess"
    | "payout"
    | "currency";

/**
 * How a field's values are represented in a serialized filter.
 *
 * `"number"` covers the small integers BitCraft uses for regions, skill ids and tiers, plus effort
 * and payout amounts. `"id"` covers 64-bit entity ids, which are held as **decimal strings**: they
 * exceed `Number.MAX_SAFE_INTEGER` and `JSON.stringify` refuses to encode a `bigint`, so a filter
 * that stored them as numbers would silently round two distinct claims onto the same id.
 * Conversion happens once, at the edge, in `CraftSubject` construction. `item` is also `"id"`
 * (despite being a small integer) for a different reason: `CraftOutput` is a tagged union of
 * `ItemType.Item` and `ItemType.Cargo`, and their ids overlap, so the id alone is not a key — see
 * `CraftSubject.item`. `"bool"` covers the yes/no facts about a craft, which only `eq`/`neq` can
 * meaningfully test. `"flag"` covers the closed enum of claim access levels (see `ClaimAccessFlag`)
 * — a fixed, small vocabulary rather than something drawn from live game/relay data. `"currency"` is
 * a second, unrelated closed vocabulary (see `BOUNTY_CURRENCIES`) — kept as its own kind rather than
 * reusing `"flag"` since a craft has exactly one currency, never a set of them. `"tag"` covers an
 * item's/cargo's category string (`ItemDesc.tag`/`CargoDesc.tag`, e.g. `"Basic Food"`) — an *open*
 * vocabulary like `"id"`, just string-typed rather than a `"item:<id>"`/`"cargo:<id>"` key, so it
 * gets its own kind rather than reusing either.
 */
export type FieldKind = "number" | "id" | "bool" | "flag" | "currency" | "tag";

/**
 * How a quantified field's per-item test is aggregated across a craft's several input items —
 * `"any"` for "some input item matches", `"all"` for "every input item matches". Only meaningful on
 * a field whose `FieldMeta.quantified` is set; see `inputItem`/`inputItemTag`.
 */
export type Quantifier = "any" | "all";

export const QUANTIFIERS: readonly Quantifier[] = ["any", "all"];

/**
 * `"all"` only ever applies to `ownerAccess` (a set-valued field): the subject's flag set must be a
 * superset of the given list, rather than merely intersecting it (`"in"`).
 */
export type Comparator = "eq" | "neq" | "in" | "notIn" | "gte" | "lte" | "all";

/**
 * The claim access levels `ownerAccess` filters over. `"member"` is basic membership — a
 * `claim_member` row exists with every permission flag clear — the rest mirror that row's boolean
 * columns one-for-one.
 */
export type ClaimAccessFlag = "member" | "build" | "inventory" | "officer" | "coOwner" | "owner";

export const CLAIM_ACCESS_FLAGS: readonly ClaimAccessFlag[] = ["member", "build", "inventory", "officer", "coOwner", "owner"];

export const CLAIM_ACCESS_FLAG_LABELS: Record<ClaimAccessFlag, string> = {
    member: "Member",
    build: "Build",
    inventory: "Storage",
    officer: "Officer",
    coOwner: "Co-owner",
    owner: "Owner",
};

/**
 * The bounty currencies a craft's payout can be denominated in.
 */
export const BOUNTY_CURRENCIES: readonly string[] = ["hex-coin"];

/**
 * The currencies that are trust-based ledgers. Payers can make payouts to these without verification.
 */
export const MANUALLY_RECORDED_BOUNTY_CURRENCIES: readonly string[] = ["hex-coin"];

export const CURRENCY_LABELS: Record<string, string> = {
    "hex-coin": "Hex Coin",
};

export type FilterValue = string | number | boolean;

export interface FieldMeta {
    kind: FieldKind;
    /** Short human label, used by `describeFilter` and the filter builder UI. */
    label: string;
    /** Comparators that make sense for this field. `gte`/`lte` need an ordering, so ids omit them. */
    comparators: readonly Comparator[];
    /**
     * True when the subject holds a *set* of values for this field rather than one. `eq`/`in` then
     * mean "the set contains" / "the set intersects", and `neq`/`notIn` their negations.
     */
    setValued?: true;
    /**
     * True when the field is tested once *per input item* rather than once per craft, with the
     * per-item results aggregated by the leaf's own `quantifier` (`"any"`/`"all"`) rather than the
     * `setValued` reading — a craft's inputs are several distinct items, each with its own key and
     * tag, not one set the whole craft either has or doesn't (unlike `ownerAccess`, one entity's
     * flags). See `inputItem`/`inputItemTag` and `CraftSubject.inputItems`.
     */
    quantified?: true;
}

const ORDERED: readonly Comparator[] = ["eq", "neq", "in", "notIn", "gte", "lte"];
const UNORDERED: readonly Comparator[] = ["eq", "neq", "in", "notIn"];
// A two-valued field has nothing to order and nothing to list: "public is any of [true, false]"
// is just "everything" spelled the long way.
const BOOLEAN: readonly Comparator[] = ["eq", "neq"];
// `eq`/`in`/`notIn` read as "has"/"has any of"/"has none of"; `all` adds "has all of", which plain
// set intersection (`in`) can't spell — "has any of [build, inventory]" and "has all of [build,
// inventory]" are genuinely different questions.
const CLAIM_ACCESS: readonly Comparator[] = ["eq", "neq", "in", "notIn", "all"];

export const FIELDS: Record<FilterField, FieldMeta> = {
    region: {kind: "number", label: "Region", comparators: UNORDERED},
    claim: {kind: "id", label: "Claim", comparators: UNORDERED},
    item: {kind: "id", label: "Output item", comparators: UNORDERED},
    itemTag: {kind: "tag", label: "Output item tag", comparators: UNORDERED},
    inputItem: {kind: "id", label: "Input item", comparators: UNORDERED, quantified: true},
    inputItemTag: {kind: "tag", label: "Input item tag", comparators: UNORDERED, quantified: true},
    skill: {kind: "number", label: "Skill", comparators: UNORDERED},
    tier: {kind: "number", label: "Tier", comparators: ORDERED},
    buildingType: {kind: "number", label: "Building", comparators: UNORDERED},
    effortTotal: {kind: "number", label: "Total effort", comparators: ORDERED},
    effortRemaining: {kind: "number", label: "Remaining effort", comparators: ORDERED},
    public: {kind: "bool", label: "Public", comparators: BOOLEAN},
    complete: {kind: "bool", label: "Complete", comparators: BOOLEAN},
    owner: {kind: "id", label: "Owner", comparators: UNORDERED},
    ownerAccess: {kind: "flag", label: "Owner's claim access", comparators: CLAIM_ACCESS, setValued: true},
    payout: {kind: "number", label: "Payout", comparators: ORDERED},
    currency: {kind: "currency", label: "Currency", comparators: UNORDERED},
};

export const FILTER_FIELDS = Object.keys(FIELDS) as FilterField[];

// ── Filter tree ───────────────────────────────────────────────

/** A single field test. `value` is an array exactly for `in`/`notIn`, a scalar otherwise. */
export interface FilterLeaf {
    field: FilterField;
    cmp: Comparator;
    value: FilterValue | FilterValue[];
    /**
     * Only read when `FIELDS[field].quantified` is true; ignored (and normally omitted) otherwise.
     * Defaults to `"any"` when absent, so a hand-edited or pasted leaf that forgot it still reads as
     * "some input item".
     */
    quantifier?: Quantifier;
}

export type FilterNode =
    | {op: "and" | "or"; children: FilterNode[]}
    | {op: "not"; child: FilterNode}
    | FilterLeaf;

export function isLeaf(node: FilterNode): node is FilterLeaf {
    return "field" in node;
}

/** The filter that matches everything — `and` over nothing, i.e. its own identity element. */
export function matchAll(): FilterNode {
    return {op: "and", children: []};
}

/**
 * The filter a fresh craft-browsing session starts from: orders that are actually work someone
 * could pick up.
 *
 * Neither exclusion is a preference. A non-public craft is only ever visible to the player who
 * owns it, and a complete one — around half of what the relay holds open at any moment — is
 * finished and merely waiting to be collected. Starting from `matchAll()` would bury the
 * available work behind both. Lives here rather than in the page so the future Discord `/crafts`
 * command and any default watch start from the same place.
 */
export function openWorkFilter(): FilterNode {
    return {
        op: "and",
        children: [
            {field: "public", cmp: "eq", value: true},
            {field: "complete", cmp: "eq", value: false},
        ],
    };
}

/**
 * Structural equality of two filter trees — order-independent for both object keys (so
 * `{...leaf, value}`-style rebuilds still compare equal to a freshly-constructed leaf) and array
 * elements (`children`, and a list-valued leaf's `value`): `[a, b]` and `[b, a]` are the same `in`
 * condition and an `and`/`or`'s children evaluate the same regardless of order, so both compare
 * equal here too. This stops short of any deeper semantic equivalence (e.g. recognizing a
 * distributed `or`-of-`and`s as equal to some restructured but logically identical tree) — that
 * would need a real tree-normalization pass for a case that's unlikely to come up in practice, for
 * a purely cosmetic comparison. Used by the craft browser to decide whether the live filter exactly
 * matches a shortcut (a saved filter, "Open Crafts", ...) so it can highlight that shortcut as
 * active — never part of evaluation.
 */
export function filtersEqual(a: FilterNode, b: FilterNode): boolean {
    return deepEqualJson(a, b);
}

function deepEqualJson(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        // Order-independent (a multiset match, not a set match — `[1, 1, 2]` still isn't
        // `[1, 2, 2]`): greedily pair each element of `a` with an unused, structurally-equal
        // element of `b`. Arrays here are always small (a filter's children, or one leaf's list of
        // values), so the worst-case O(n²) is never a real cost.
        const remaining = [...b];
        return a.every(itemA => {
            const index = remaining.findIndex(itemB => deepEqualJson(itemA, itemB));
            if (index === -1) return false;
            remaining.splice(index, 1);
            return true;
        });
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        return aKeys.length === bKeys.length && aKeys.every(key =>
            Object.prototype.hasOwnProperty.call(b, key) &&
            deepEqualJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    }
    return false;
}

/**
 * The skill/tier selection a quick-filter UI drives on top of `openWorkFilter()` — see
 * `quickWorkFilterState`/`quickWorkFilter`.
 */
export interface QuickWorkFilterState {
    skills: number[];
    tiers: number[];
}

/**
 * Recognizes `node` as *exactly* `openWorkFilter()` plus an optional `skill in [...]` and/or
 * `tier in [...]` leaf, in either order and nothing else — the one shape the craft browser's
 * quick-filter skill/tier grids can drive with a plain toggle. Returns `null` for anything else,
 * including a hand-edited filter that happens to be semantically equivalent but structured
 * differently (an explicit `or` of two tiers, an extra redundant leaf, a negation, ...): the grids
 * only ever *reflect* this exact shape, they don't try to interpret arbitrary filters, so a
 * "doesn't match" filter renders them inert rather than guessing at some partial selection.
 */
export function quickWorkFilterState(node: FilterNode): QuickWorkFilterState | null {
    if (isLeaf(node) || node.op !== "and") return null;

    let sawPublic = false;
    let sawComplete = false;
    let skills: number[] | null = null;
    let tiers: number[] | null = null;

    for (const child of node.children) {
        if (!isLeaf(child)) return null;
        if (child.field === "public" && child.cmp === "eq" && child.value === true) {
            sawPublic = true;
        } else if (child.field === "complete" && child.cmp === "eq" && child.value === false) {
            sawComplete = true;
        } else if (child.field === "skill" && child.cmp === "in" && Array.isArray(child.value) && skills === null) {
            skills = child.value as number[];
        } else if (child.field === "tier" && child.cmp === "in" && Array.isArray(child.value) && tiers === null) {
            tiers = child.value as number[];
        } else {
            return null;
        }
    }

    return sawPublic && sawComplete ? {skills: skills ?? [], tiers: tiers ?? []} : null;
}

/** The inverse of `quickWorkFilterState`: `openWorkFilter()` plus `state`'s skill/tier selection. */
export function quickWorkFilter(state: QuickWorkFilterState): FilterNode {
    const children: FilterNode[] = [...(openWorkFilter() as {op: "and"; children: FilterNode[]}).children];
    if (state.skills.length > 0) children.push({field: "skill", cmp: "in", value: state.skills});
    if (state.tiers.length > 0) children.push({field: "tier", cmp: "in", value: state.tiers});
    return {op: "and", children};
}

// ── Subject ───────────────────────────────────────────────────

/**
 * One of a craft's consumed items. `key` is tagged the same way as `CraftSubject.item` (see its doc
 * comment); `tag` is `null` when that item's own `ItemDesc`/`CargoDesc` row hasn't resolved, which
 * does not require dropping the entry — `key` comes straight off the recipe's stack list and needs
 * no desc lookup at all, so an `inputItem` leaf can still match one even when `inputItemTag` can't.
 */
export interface CraftInputItem {
    key: string;
    tag: string | null;
}

/**
 * The flat projection of a craft that a filter is evaluated against.
 *
 * A field is `null` when the craft genuinely has no such value (an unclaimed craft has no claim, a
 * craft with no bounty rule has no payout). **A `null` never matches any comparator, not even
 * `neq`** — "not tier 3" would otherwise quietly sweep in every craft of unknown tier, which is
 * never what someone building a work queue meant. Write `not(eq)` to include the unknowns.
 */
export interface CraftSubject {
    region: number;
    claim: string | null;
    /**
     * The craft's output item, as `"item:<id>"` or `"cargo:<id>"` — not a bare id. `ItemType.Item`
     * and `ItemType.Cargo` are separate id spaces that overlap (item id 1 and cargo id 1 are
     * unrelated things), so the tag has to travel with the id or a filter built for one would also
     * match crafts of the other.
     */
    item: string | null;
    /** The output item's category (`ItemDesc.tag`/`CargoDesc.tag`), `null` when `item` itself is. */
    itemTag: string | null;
    /**
     * The craft's consumed items, one entry per recipe input — unlike `item`, genuinely plural, so
     * a leaf on `inputItem`/`inputItemTag` is tested once per entry and aggregated by its own
     * `quantifier` rather than read as a single scalar. Empty when the recipe is unknown or (rare,
     * e.g. some passive recipes) takes no inputs at all — either way, `inputItem`/`inputItemTag`
     * leaves never match, the same "unknown never matches" rule every other field follows.
     */
    inputItems: readonly CraftInputItem[];
    skill: number | null;
    tier: number | null;
    buildingType: number | null;
    effortTotal: number;
    effortRemaining: number;
    /** True when the craft is open to anyone. A private craft is visible only to its **owner**. */
    public: boolean;
    /** True when the order has hit its action count and is only waiting to be collected. */
    complete: boolean;
    owner: string | null;
    /**
     * The claim access flags the craft's **owner** holds in the craft's own claim — not an
     * arbitrary claim, and not any other member. `null` when there is no such thing to check (no
     * claim, or no owner); an empty array when the claim and owner are both known but the owner
     * holds no `claim_member` row there at all (a real, known fact — not the same as `null`).
     */
    ownerClaimAccess: readonly ClaimAccessFlag[] | null;
    /**
     * A plain floating-point currency-per-effort approximation of the craft's resolved bounty, for
     * filtering, sorting, and display only — `null` when the craft has no bounty. The real ledger
     * math always uses the exact integer fraction (see `@brico/crafts/entitlement`), never this.
     */
    payout: number | null;
    currency: string | null;
    /** True when the resolved bounty came from `craft_private_bounty_assignment` — display-only, not a filterable field. */
    bountyPrivate: boolean;
}

// ── Evaluation ────────────────────────────────────────────────

function compareScalar(subjectValue: FilterValue, leaf: FilterLeaf): boolean {
    const {cmp, value} = leaf;
    switch (cmp) {
        case "eq":
            return subjectValue === value;
        case "neq":
            return subjectValue !== value;
        case "in":
            return Array.isArray(value) && value.includes(subjectValue);
        case "notIn":
            return Array.isArray(value) && !value.includes(subjectValue);
        case "gte":
            return typeof subjectValue === "number" && typeof value === "number" && subjectValue >= value;
        case "lte":
            return typeof subjectValue === "number" && typeof value === "number" && subjectValue <= value;
        // Only offered on set-valued fields; `validateFilter` rejects it everywhere else.
        case "all":
            return false;
    }
}

function compareSet(subjectValues: readonly FilterValue[], leaf: FilterLeaf): boolean {
    const {cmp, value} = leaf;
    switch (cmp) {
        case "eq":
            return subjectValues.includes(value as FilterValue);
        case "neq":
            return !subjectValues.includes(value as FilterValue);
        case "in":
            return Array.isArray(value) && value.some(v => subjectValues.includes(v));
        case "notIn":
            return Array.isArray(value) && !value.some(v => subjectValues.includes(v));
        case "all":
            return Array.isArray(value) && value.every(v => subjectValues.includes(v));
        // Ordering a set of entity ids is meaningless; `validateFilter` rejects these up front.
        case "gte":
        case "lte":
            return false;
    }
}

function evaluateLeaf(leaf: FilterLeaf, subject: CraftSubject): boolean {
    const meta = FIELDS[leaf.field];
    // An unknown field can only come from a hand-edited or future-versioned saved filter. Matching
    // nothing (rather than throwing) keeps one stale leaf from breaking the whole page.
    if (!meta) return false;
    if (meta.quantified) {
        if (subject.inputItems.length === 0) return false;
        const extract = leaf.field === "inputItem" ? (i: CraftInputItem) => i.key : (i: CraftInputItem) => i.tag;
        // An item whose own value is unresolved (`tag === null`) never satisfies a per-item test —
        // same "unknown never matches" rule `compareScalar`'s null guard enforces for every other
        // field, just applied per input instead of once for the whole craft.
        const test = (item: CraftInputItem) => {
            const value = extract(item);
            return value !== null && compareScalar(value, leaf);
        };
        return (leaf.quantifier ?? "any") === "all" ? subject.inputItems.every(test) : subject.inputItems.some(test);
    }
    if (meta.setValued) {
        if (subject.ownerClaimAccess === null) return false;
        return compareSet(subject.ownerClaimAccess, leaf);
    }
    const subjectValue = subject[leaf.field as Exclude<FilterField, "ownerAccess" | "inputItem" | "inputItemTag">];
    if (subjectValue === null || subjectValue === undefined) return false;
    return compareScalar(subjectValue, leaf);
}

/** Evaluates `node` against `subject`. Pure, allocation-free — safe to call per row per keystroke. */
export function evaluateFilter(node: FilterNode, subject: CraftSubject): boolean {
    if (isLeaf(node)) return evaluateLeaf(node, subject);
    switch (node.op) {
        case "and":
            return node.children.every(child => evaluateFilter(child, subject));
        case "or":
            return node.children.some(child => evaluateFilter(child, subject));
        case "not":
            return !evaluateFilter(node.child, subject);
    }
}

/**
 * Would `node` match `subject` if the craft had not (yet) finished?
 *
 * A filter like `openWorkFilter()` (`complete eq false`) is written to describe *open work*, and a
 * craft that satisfies it stops matching the instant it completes — by design, `evaluateFilter`
 * can't tell "this stopped matching because it finished" apart from "this stopped matching because
 * it was claimed, went private, changed claim, etc.", since both just read as "no longer in the
 * match set" to a caller diffing two snapshots. This answers exactly that question, by re-running
 * the same tree with `subject.complete` forced to `false`: if the row would still match, completion
 * was the *only* thing that changed, and a watcher whose mental model is "tell me about this open
 * work" should hear "finished" once, not silence followed by an unexplained "removed".
 */
export function wouldMatchIfOpen(node: FilterNode, subject: CraftSubject): boolean {
    if (!subject.complete) return evaluateFilter(node, subject);
    return evaluateFilter(node, {...subject, complete: false});
}

// ── Validation / parsing ──────────────────────────────────────

const TYPEOF_FOR_KIND: Record<FieldKind, string> = {
    number: "number",
    id: "string",
    bool: "boolean",
    flag: "string",
    currency: "string",
    tag: "string",
};
const KIND_TEXT: Record<FieldKind, string> = {
    number: "numbers",
    id: "entity id strings",
    bool: "true or false",
    flag: `one of ${CLAIM_ACCESS_FLAGS.join(", ")}`,
    currency: `one of ${BOUNTY_CURRENCIES.join(", ")}`,
    tag: "item tag strings",
};
// Kinds with a fixed, closed vocabulary that `validateFilter` checks values against, keyed the same
// way so a future closed-vocabulary kind is one entry here rather than another hardcoded branch.
const ALLOWED_VALUES_FOR_KIND: Partial<Record<FieldKind, readonly string[]>> = {
    flag: CLAIM_ACCESS_FLAGS,
    currency: BOUNTY_CURRENCIES,
};

/**
 * Structural problems with a filter tree, as human-readable messages — empty when the filter is
 * sound. Used both to gate the "Save" button in the builder and to reject a corrupt localStorage
 * payload before it is ever evaluated.
 *
 * `disallowedFields` rejects a leaf that tests one of the given fields as a hard error, not a
 * warning — used by the bounty-rule builder to forbid a rule from conditioning on `payout`/
 * `currency`, since a rule that could reference the very bounty it assigns is circular.
 */
export function validateFilter(node: unknown, path = "filter", disallowedFields?: readonly FilterField[]): string[] {
    if (typeof node !== "object" || node === null) return [`${path}: expected an object`];
    const candidate = node as Record<string, unknown>;

    if ("field" in candidate) {
        const problems: string[] = [];
        const field = candidate.field as FilterField;
        const meta = FIELDS[field];
        if (!meta) return [`${path}: unknown field "${String(field)}"`];
        if (disallowedFields?.includes(field)) {
            problems.push(`${path}: ${meta.label} cannot be used here`);
        }
        if (meta.quantified) {
            const quantifier = candidate.quantifier;
            if (quantifier !== undefined && !QUANTIFIERS.includes(quantifier as Quantifier)) {
                problems.push(`${path}: ${meta.label} needs a quantifier of "any" or "all"`);
            }
        } else if ("quantifier" in candidate) {
            problems.push(`${path}: ${meta.label} does not take a quantifier`);
        }
        const cmp = candidate.cmp as Comparator;
        if (!meta.comparators.includes(cmp)) {
            problems.push(`${path}: ${meta.label} does not support "${String(cmp)}"`);
        }
        const wantsList = cmp === "in" || cmp === "notIn" || cmp === "all";
        const value = candidate.value;
        if (wantsList !== Array.isArray(value)) {
            problems.push(`${path}: "${String(cmp)}" expects ${wantsList ? "a list of values" : "a single value"}`);
        } else {
            const values = Array.isArray(value) ? value : [value];
            if (values.length === 0) problems.push(`${path}: ${meta.label} has no values`);
            const allowed = ALLOWED_VALUES_FOR_KIND[meta.kind];
            if (values.some(v => typeof v !== TYPEOF_FOR_KIND[meta.kind])) {
                problems.push(`${path}: ${meta.label} values must be ${KIND_TEXT[meta.kind]}`);
            } else if (allowed && values.some(v => !allowed.includes(v as string))) {
                problems.push(`${path}: ${meta.label} values must be ${KIND_TEXT[meta.kind]}`);
            }
        }
        return problems;
    }

    switch (candidate.op) {
        case "and":
        case "or": {
            const children = candidate.children;
            if (!Array.isArray(children)) return [`${path}: "${candidate.op}" needs a children array`];
            return children.flatMap((child, i) => validateFilter(child, `${path}.${candidate.op}[${i}]`, disallowedFields));
        }
        case "not":
            return validateFilter(candidate.child, `${path}.not`, disallowedFields);
        default:
            return [`${path}: unknown node type`];
    }
}

/**
 * Parses a filter out of untrusted JSON (localStorage today, a `filter_json` column later),
 * returning `null` rather than throwing when it doesn't validate.
 */
export function parseFilter(raw: unknown): FilterNode | null {
    return validateFilter(raw).length === 0 ? (raw as FilterNode) : null;
}

// ── Description ───────────────────────────────────────────────

const CMP_TEXT: Record<Comparator, string> = {
    eq: "is",
    neq: "is not",
    in: "is any of",
    notIn: "is none of",
    gte: "≥",
    lte: "≤",
    all: "has all of",
};

/**
 * A one-line human rendering of a filter, for saved-filter lists and Discord embeds later.
 *
 * `labelFor` resolves an id/number to something a player recognizes ("Ferralith Ingot" rather than
 * `1150001`). It stays a caller-supplied callback because resolving those names needs the game
 * data tables, and importing those here would defeat the point of this module being standalone.
 */
export function describeFilter(
    node: FilterNode,
    labelFor: (field: FilterField, value: FilterValue) => string = (_f, v) => String(v),
): string {
    if (isLeaf(node)) {
        const meta = FIELDS[node.field];
        const values = Array.isArray(node.value) ? node.value : [node.value];
        // A boolean has no name worth looking up, and "Public is true" reads like a type error. A
        // flag is a fixed, closed vocabulary too — its label doesn't depend on live game data, so
        // it's rendered here rather than pushed onto every caller's `labelFor`.
        const render = meta?.kind === "bool"
            ? (value: FilterValue) => (value ? "yes" : "no")
            : meta?.kind === "flag"
                ? (value: FilterValue) => CLAIM_ACCESS_FLAG_LABELS[value as ClaimAccessFlag] ?? String(value)
                : meta?.kind === "currency"
                    ? (value: FilterValue) => CURRENCY_LABELS[value as string] ?? String(value)
                    : (value: FilterValue) => labelFor(node.field, value);
        const rendered = values.map(render).join(", ");
        // "Some"/"Every" reads as the subject of the sentence ("Some input item is..."), so it goes
        // before the field label rather than after — unlike a set-valued field's comparator text,
        // which reads as a verb phrase after the label ("...access has all of...").
        const quantifierPrefix = meta?.quantified ? (node.quantifier === "all" ? "Every " : "Some ") : "";
        return `${quantifierPrefix}${meta?.label ?? node.field} ${CMP_TEXT[node.cmp] ?? node.cmp} ${Array.isArray(node.value) ? `[${rendered}]` : rendered}`;
    }
    if (node.op === "not") return `not (${describeFilter(node.child, labelFor)})`;
    if (node.children.length === 0) return node.op === "and" ? "everything" : "nothing";
    if (node.children.length === 1) return describeFilter(node.children[0], labelFor);
    return node.children.map(child => {
        const text = describeFilter(child, labelFor);
        return isLeaf(child) ? text : `(${text})`;
    }).join(node.op === "and" ? " and " : " or ");
}

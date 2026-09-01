/**
 * Unit tests for the craft filter engine. Run with `npm test` (Node's built-in runner — the engine
 * is dependency-free by design, so it needs no bundler or DOM to exercise).
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    type CraftSubject,
    describeFilter,
    evaluateFilter,
    type FilterNode,
    filtersEqual,
    isLeaf,
    matchAll,
    openWorkFilter,
    parseFilter,
    quickWorkFilter,
    quickWorkFilterState,
    validateFilter,
    wouldMatchIfOpen,
} from "./filter.ts";

function craft(overrides: Partial<CraftSubject> = {}): CraftSubject {
    return {
        region: 3,
        claim: "360287970189639680",
        item: "item:1150001",
        itemTag: "Basic Food",
        inputItems: [{key: "item:2", tag: "Ingredients"}, {key: "item:3", tag: "Ingredients"}],
        skill: 12,
        tier: 4,
        buildingType: 127749503,
        effortTotal: 1000,
        effortRemaining: 250,
        public: true,
        complete: false,
        owner: "144115188075855872",
        ownerClaimAccess: ["member", "build", "officer"],
        payout: null,
        currency: null,
        bountyPrivate: false,
        ...overrides,
    };
}

describe("evaluateFilter — leaves", () => {
    it("compares numbers by value", () => {
        assert.equal(evaluateFilter({field: "tier", cmp: "eq", value: 4}, craft()), true);
        assert.equal(evaluateFilter({field: "tier", cmp: "eq", value: 5}, craft()), false);
        assert.equal(evaluateFilter({field: "tier", cmp: "neq", value: 5}, craft()), true);
        assert.equal(evaluateFilter({field: "tier", cmp: "gte", value: 4}, craft()), true);
        assert.equal(evaluateFilter({field: "tier", cmp: "lte", value: 3}, craft()), false);
    });

    it("compares entity ids as strings, without precision loss", () => {
        // Both ids round to the same f64, so a number-typed filter could not tell them apart.
        const a = "360287970189639681";
        const b = "360287970189639682";
        assert.equal(Number(a), Number(b));
        assert.equal(evaluateFilter({field: "claim", cmp: "eq", value: a}, craft({claim: a})), true);
        assert.equal(evaluateFilter({field: "claim", cmp: "eq", value: b}, craft({claim: a})), false);
    });

    it("handles in / notIn against a list", () => {
        assert.equal(evaluateFilter({field: "region", cmp: "in", value: [3, 11]}, craft()), true);
        assert.equal(evaluateFilter({field: "region", cmp: "in", value: [11, 15]}, craft()), false);
        assert.equal(evaluateFilter({field: "region", cmp: "notIn", value: [11, 15]}, craft()), true);
    });

    it("keeps an item and a cargo of the same id from matching each other's filter", () => {
        // `ItemType.Item` and `ItemType.Cargo` are separate id spaces that overlap, so the subject
        // (and any leaf built against it) has to carry the tag, not the bare numeric id.
        const item = craft({item: "item:1"});
        const cargo = craft({item: "cargo:1"});
        assert.equal(evaluateFilter({field: "item", cmp: "eq", value: "item:1"}, item), true);
        assert.equal(evaluateFilter({field: "item", cmp: "eq", value: "item:1"}, cargo), false);
        assert.equal(evaluateFilter({field: "item", cmp: "eq", value: "cargo:1"}, cargo), true);
    });

    it("never matches a null subject value — not even with a negated comparator", () => {
        const unclaimed = craft({claim: null, tier: null, payout: null});
        assert.equal(evaluateFilter({field: "claim", cmp: "eq", value: "1"}, unclaimed), false);
        assert.equal(evaluateFilter({field: "claim", cmp: "neq", value: "1"}, unclaimed), false);
        assert.equal(evaluateFilter({field: "tier", cmp: "lte", value: 99}, unclaimed), false);
        assert.equal(evaluateFilter({field: "payout", cmp: "gte", value: 0}, unclaimed), false);
        // ...so `not(eq)` is how you deliberately include the unknowns.
        assert.equal(evaluateFilter({op: "not", child: {field: "tier", cmp: "eq", value: 4}}, unclaimed), true);
    });

    it("compares booleans with eq / neq", () => {
        assert.equal(evaluateFilter({field: "public", cmp: "eq", value: true}, craft()), true);
        assert.equal(evaluateFilter({field: "public", cmp: "eq", value: false}, craft()), false);
        assert.equal(evaluateFilter({field: "complete", cmp: "neq", value: true}, craft()), true);
        assert.equal(evaluateFilter({field: "complete", cmp: "eq", value: true}, craft({complete: true})), true);
        // `false` is a real value, not an absent one — it must not fall into the null hole.
        assert.equal(evaluateFilter({field: "complete", cmp: "eq", value: false}, craft()), true);
    });

    it("treats ownerAccess as a set membership test over the owner's claim access flags", () => {
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "eq", value: "build"}, craft()), true);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "eq", value: "coOwner"}, craft()), false);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "neq", value: "coOwner"}, craft()), true);
        // "any of" — the owner needs only one of the listed flags.
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "in", value: ["coOwner", "build"]}, craft()), true);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "in", value: ["coOwner", "owner"]}, craft()), false);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "notIn", value: ["coOwner"]}, craft()), true);
        // "all of" — the owner needs every listed flag, unlike "in".
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "all", value: ["build", "officer"]}, craft()), true);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "all", value: ["build", "coOwner"]}, craft()), false);
        // Basic membership: a `claim_member` row with no elevated flags still carries "member".
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "eq", value: "member"}, craft({ownerClaimAccess: ["member"]})), true);
        // A known non-member (claim and owner both resolved, but no `claim_member` row) is a real
        // fact, not an unknown — an empty set, so "has member" is false and "is not X" is true.
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "eq", value: "member"}, craft({ownerClaimAccess: []})), false);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "neq", value: "member"}, craft({ownerClaimAccess: []})), true);
        // An unknown owner has nothing to check — `null` never matches, not even through negation.
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "eq", value: "member"}, craft({ownerClaimAccess: null})), false);
        assert.equal(evaluateFilter({field: "ownerAccess", cmp: "neq", value: "member"}, craft({ownerClaimAccess: null})), false);
    });

    it("tests inputItem/inputItemTag once per input, aggregated by quantifier", () => {
        const twoInputs = craft({inputItems: [{key: "item:2", tag: "Ingredients"}, {key: "item:3", tag: "Ingredients"}]});
        const mixedTags = craft({inputItems: [{key: "item:2", tag: "Ingredients"}, {key: "item:3", tag: "Tools"}]});

        // "any" (the default): true as soon as one input matches.
        assert.equal(evaluateFilter({field: "inputItem", cmp: "eq", value: "item:2"}, twoInputs), true);
        assert.equal(evaluateFilter({field: "inputItem", cmp: "eq", value: "item:9"}, twoInputs), false);
        assert.equal(evaluateFilter({field: "inputItem", cmp: "in", value: ["item:3", "item:9"]}, twoInputs), true);
        assert.equal(evaluateFilter({field: "inputItem", cmp: "eq", value: "item:2", quantifier: "any"}, twoInputs), true);

        // "all": every input has to satisfy the per-item test.
        assert.equal(evaluateFilter({field: "inputItemTag", cmp: "eq", value: "Ingredients", quantifier: "all"}, twoInputs), true);
        assert.equal(evaluateFilter({field: "inputItemTag", cmp: "eq", value: "Ingredients", quantifier: "all"}, mixedTags), false);
        // "all" + "neq" reads as "no input item is X".
        assert.equal(evaluateFilter({field: "inputItem", cmp: "neq", value: "item:9", quantifier: "all"}, twoInputs), true);
        assert.equal(evaluateFilter({field: "inputItem", cmp: "neq", value: "item:2", quantifier: "all"}, twoInputs), false);

        // No known inputs never matches, "all" included — vacuous truth is not what "every input
        // item has tag X" means when there is nothing to check.
        const noInputs = craft({inputItems: []});
        assert.equal(evaluateFilter({field: "inputItem", cmp: "eq", value: "item:2"}, noInputs), false);
        assert.equal(evaluateFilter({field: "inputItemTag", cmp: "eq", value: "Ingredients", quantifier: "all"}, noInputs), false);

        // An input whose own tag hasn't resolved never satisfies a per-item test, "all" included.
        const unresolvedTag = craft({inputItems: [{key: "item:2", tag: null}, {key: "item:3", tag: "Ingredients"}]});
        assert.equal(evaluateFilter({field: "inputItemTag", cmp: "eq", value: "Ingredients", quantifier: "all"}, unresolvedTag), false);
        assert.equal(evaluateFilter({field: "inputItemTag", cmp: "eq", value: "Ingredients", quantifier: "any"}, unresolvedTag), true);
    });

    it("matches output item and output item tag as plain scalars", () => {
        assert.equal(evaluateFilter({field: "item", cmp: "eq", value: "item:1150001"}, craft()), true);
        assert.equal(evaluateFilter({field: "itemTag", cmp: "eq", value: "Basic Food"}, craft()), true);
        assert.equal(evaluateFilter({field: "itemTag", cmp: "eq", value: "Basic Food"}, craft({itemTag: null})), false);
    });

    it("matches nothing for a field it does not recognize", () => {
        const stale = {field: "colour", cmp: "eq", value: 1} as unknown as FilterNode;
        assert.equal(evaluateFilter(stale, craft()), false);
    });
});

describe("evaluateFilter — tree", () => {
    it("combines with and / or / not", () => {
        const node: FilterNode = {
            op: "and",
            children: [
                {field: "region", cmp: "eq", value: 3},
                {op: "or", children: [
                    {field: "tier", cmp: "gte", value: 6},
                    {field: "effortRemaining", cmp: "lte", value: 500},
                ]},
                {op: "not", child: {field: "skill", cmp: "eq", value: 99}},
            ],
        };
        assert.equal(evaluateFilter(node, craft()), true);
        assert.equal(evaluateFilter(node, craft({region: 11})), false);
        assert.equal(evaluateFilter(node, craft({effortRemaining: 900})), false);
        assert.equal(evaluateFilter(node, craft({skill: 99})), false);
    });

    it("uses identity elements for empty groups", () => {
        assert.equal(evaluateFilter(matchAll(), craft()), true);
        assert.equal(evaluateFilter({op: "or", children: []}, craft()), false);
    });
});

describe("validateFilter", () => {
    it("accepts a well-formed tree", () => {
        assert.deepEqual(validateFilter({op: "and", children: [{field: "tier", cmp: "gte", value: 3}]}), []);
    });

    it("rejects an ordering comparator on an unordered field", () => {
        assert.equal(validateFilter({field: "claim", cmp: "gte", value: "1"}).length, 1);
    });

    it("rejects a value whose shape does not match the comparator", () => {
        assert.equal(validateFilter({field: "tier", cmp: "in", value: 3}).length, 1);
        assert.equal(validateFilter({field: "tier", cmp: "eq", value: [3]}).length, 1);
        assert.equal(validateFilter({field: "tier", cmp: "in", value: []}).length, 1);
    });

    it("rejects an id given as a number and a number given as a string", () => {
        assert.equal(validateFilter({field: "claim", cmp: "eq", value: 1}).length, 1);
        assert.equal(validateFilter({field: "tier", cmp: "eq", value: "4"}).length, 1);
    });

    it("accepts only booleans, and only eq / neq, on a boolean field", () => {
        assert.deepEqual(validateFilter({field: "public", cmp: "eq", value: true}), []);
        assert.deepEqual(validateFilter({field: "complete", cmp: "neq", value: false}), []);
        assert.equal(validateFilter({field: "public", cmp: "eq", value: 1}).length, 1);
        assert.equal(validateFilter({field: "public", cmp: "eq", value: "true"}).length, 1);
        assert.equal(validateFilter({field: "public", cmp: "gte", value: true}).length, 1);
        // `in` would only ever spell "everything" or "nothing", so it is not offered at all.
        assert.equal(validateFilter({field: "public", cmp: "in", value: [true]}).length, 1);
    });

    it("accepts only the known claim access flags, and rejects `all` off a set-valued field", () => {
        assert.deepEqual(validateFilter({field: "ownerAccess", cmp: "eq", value: "build"}), []);
        assert.deepEqual(validateFilter({field: "ownerAccess", cmp: "all", value: ["build", "officer"]}), []);
        assert.equal(validateFilter({field: "ownerAccess", cmp: "eq", value: "manager"}).length, 1);
        // `all` needs an ordering-free set to be a superset of, which only `ownerAccess` has.
        assert.equal(validateFilter({field: "tier", cmp: "all", value: [3]}).length, 1);
    });

    it("accepts only known currency ids, a second closed vocabulary distinct from ownerAccess's", () => {
        assert.deepEqual(validateFilter({field: "currency", cmp: "eq", value: "hex-coin"}), []);
        assert.equal(validateFilter({field: "currency", cmp: "eq", value: "usd"}).length, 1);
    });

    it("accepts a valid quantifier on a quantified field, and rejects everything else", () => {
        assert.deepEqual(validateFilter({field: "inputItem", cmp: "eq", value: "item:1", quantifier: "all"}), []);
        assert.deepEqual(validateFilter({field: "inputItem", cmp: "eq", value: "item:1"}), []);
        assert.equal(validateFilter({field: "inputItem", cmp: "eq", value: "item:1", quantifier: "every"}).length, 1);
        // A non-quantified field carrying a quantifier at all is rejected, valid value or not.
        assert.equal(validateFilter({field: "item", cmp: "eq", value: "item:1", quantifier: "all"}).length, 1);
    });

    it("rejects a leaf on a disallowedFields field as a hard error", () => {
        assert.equal(validateFilter({field: "payout", cmp: "gte", value: 1}, "filter", ["payout", "currency"]).length, 1);
        assert.equal(validateFilter({field: "currency", cmp: "eq", value: "hex-coin"}, "filter", ["payout", "currency"]).length, 1);
        // Unaffected fields still pass.
        assert.deepEqual(validateFilter({field: "tier", cmp: "eq", value: 4}, "filter", ["payout", "currency"]), []);
    });

    it("threads disallowedFields into and/or/not children", () => {
        const nested: FilterNode = {op: "and", children: [{op: "not", child: {field: "payout", cmp: "gte", value: 1}}]};
        assert.equal(validateFilter(nested, "filter", ["payout"]).length, 1);
    });

    it("reports the path of a nested problem", () => {
        const [problem] = validateFilter({op: "or", children: [{op: "not", child: {field: "nope", cmp: "eq", value: 1}}]});
        assert.match(problem, /filter\.or\[0]\.not/);
    });

    it("parseFilter returns null for anything that does not validate", () => {
        const parsed = parseFilter({op: "and", children: []});
        assert.ok(parsed !== null && !isLeaf(parsed) && parsed.op === "and");
        assert.equal(parseFilter({op: "whatever"}), null);
        assert.equal(parseFilter("not even an object"), null);
    });
});

describe("describeFilter", () => {
    it("renders a readable summary and parenthesizes nested groups", () => {
        const node: FilterNode = {
            op: "and",
            children: [
                {field: "region", cmp: "eq", value: 3},
                {op: "or", children: [
                    {field: "tier", cmp: "gte", value: 6},
                    {field: "skill", cmp: "in", value: [12, 13]},
                ]},
            ],
        };
        assert.equal(describeFilter(node), "Region is 3 and (Tier ≥ 6 or Skill is any of [12, 13])");
    });

    it("resolves values through the caller's label function", () => {
        const labels = describeFilter({field: "skill", cmp: "eq", value: 12}, (_field, value) => `Carpentry(${value})`);
        assert.equal(labels, "Skill is Carpentry(12)");
    });

    it("renders booleans as yes / no rather than through labelFor", () => {
        assert.equal(describeFilter(openWorkFilter()), "Public is yes and Complete is no");
    });

    it("renders claim access flags by their own label rather than through labelFor", () => {
        assert.equal(
            describeFilter({field: "ownerAccess", cmp: "all", value: ["build", "coOwner"]}, () => "wrong"),
            "Owner's claim access has all of [Build, Co-owner]",
        );
    });

    it("renders currency by its own label rather than through labelFor", () => {
        assert.equal(
            describeFilter({field: "currency", cmp: "eq", value: "hex-coin"}, () => "wrong"),
            "Currency is Hex Coin",
        );
    });

    it("prefixes a quantified field's leaf with its quantifier", () => {
        assert.equal(
            describeFilter({field: "inputItem", cmp: "in", value: ["item:2", "item:3"]}, () => "Sturdy Plank"),
            "Some Input item is any of [Sturdy Plank, Sturdy Plank]",
        );
        assert.equal(
            describeFilter({field: "inputItemTag", cmp: "eq", value: "Ingredients", quantifier: "all"}),
            "Every Input item tag is Ingredients",
        );
    });

    it("names the empty groups", () => {
        assert.equal(describeFilter(matchAll()), "everything");
        assert.equal(describeFilter({op: "or", children: []}), "nothing");
    });
});

describe("openWorkFilter", () => {
    it("keeps public, unfinished work and drops everything else", () => {
        const filter = openWorkFilter();
        assert.deepEqual(validateFilter(filter), []);
        assert.equal(evaluateFilter(filter, craft()), true);
        assert.equal(evaluateFilter(filter, craft({public: false})), false);
        assert.equal(evaluateFilter(filter, craft({complete: true})), false);
    });
});

describe("quickWorkFilterState / quickWorkFilter", () => {
    it("recognizes the bare open-work filter as an empty selection", () => {
        assert.deepEqual(quickWorkFilterState(openWorkFilter()), {skills: [], tiers: []});
    });

    it("recognizes open-work plus a skill selection", () => {
        const node = quickWorkFilter({skills: [3, 5], tiers: []});
        assert.deepEqual(quickWorkFilterState(node), {skills: [3, 5], tiers: []});
    });

    it("recognizes open-work plus a tier selection", () => {
        const node = quickWorkFilter({skills: [], tiers: [4, 6]});
        assert.deepEqual(quickWorkFilterState(node), {skills: [], tiers: [4, 6]});
    });

    it("recognizes open-work plus both selections, regardless of leaf order", () => {
        const state = {skills: [2], tiers: [7]};
        assert.deepEqual(quickWorkFilterState(quickWorkFilter(state)), state);

        const reordered: FilterNode = {
            op: "and",
            children: [
                {field: "tier", cmp: "in", value: [7]},
                {field: "skill", cmp: "in", value: [2]},
                {field: "public", cmp: "eq", value: true},
                {field: "complete", cmp: "eq", value: false},
            ],
        };
        assert.deepEqual(quickWorkFilterState(reordered), state);
    });

    it("rejects a bare leaf", () => {
        assert.equal(quickWorkFilterState({field: "public", cmp: "eq", value: true}), null);
    });

    it("rejects a negated group", () => {
        assert.equal(quickWorkFilterState({op: "not", child: openWorkFilter()}), null);
    });

    it("rejects 'or' in place of 'and'", () => {
        const node: FilterNode = {op: "or", children: (openWorkFilter() as {children: FilterNode[]}).children};
        assert.equal(quickWorkFilterState(node), null);
    });

    it("rejects a missing public/complete leaf", () => {
        const node: FilterNode = {op: "and", children: [{field: "public", cmp: "eq", value: true}]};
        assert.equal(quickWorkFilterState(node), null);
    });

    it("rejects an extra, unrelated leaf", () => {
        const node: FilterNode = {
            op: "and",
            children: [...(openWorkFilter() as {children: FilterNode[]}).children, {field: "region", cmp: "eq", value: 3}],
        };
        assert.equal(quickWorkFilterState(node), null);
    });

    it("rejects the wrong comparator on skill/tier", () => {
        const node: FilterNode = {
            op: "and",
            children: [...(openWorkFilter() as {children: FilterNode[]}).children, {field: "tier", cmp: "eq", value: 4}],
        };
        assert.equal(quickWorkFilterState(node), null);
    });

    it("rejects a duplicated skill/tier leaf", () => {
        const node: FilterNode = {
            op: "and",
            children: [
                ...(openWorkFilter() as {children: FilterNode[]}).children,
                {field: "skill", cmp: "in", value: [1]},
                {field: "skill", cmp: "in", value: [2]},
            ],
        };
        assert.equal(quickWorkFilterState(node), null);
    });
});

describe("filtersEqual", () => {
    it("is true for two independently-built but structurally identical trees", () => {
        assert.equal(filtersEqual(openWorkFilter(), openWorkFilter()), true);
        assert.equal(filtersEqual(quickWorkFilter({skills: [3, 5], tiers: []}), quickWorkFilter({skills: [3, 5], tiers: []})), true);
    });

    it("ignores object key order", () => {
        const a: FilterNode = {field: "tier", cmp: "eq", value: 4};
        const b: FilterNode = {value: 4, cmp: "eq", field: "tier"} as FilterNode;
        assert.equal(filtersEqual(a, b), true);
    });

    it("ignores a list-valued leaf's value order, since 'in' evaluates the same either way", () => {
        const a: FilterNode = {field: "tier", cmp: "in", value: [3, 4]};
        const b: FilterNode = {field: "tier", cmp: "in", value: [4, 3]};
        assert.equal(filtersEqual(a, b), true);
    });

    it("ignores a group's children order, since and/or evaluate the same either way", () => {
        const a: FilterNode = {op: "and", children: [{field: "tier", cmp: "eq", value: 4}, {field: "skill", cmp: "eq", value: 3}]};
        const b: FilterNode = {op: "and", children: [{field: "skill", cmp: "eq", value: 3}, {field: "tier", cmp: "eq", value: 4}]};
        assert.equal(filtersEqual(a, b), true);
    });

    it("matches arrays as multisets, not sets — a duplicated value still has to be matched one-for-one", () => {
        const a: FilterNode = {field: "tier", cmp: "in", value: [1, 1, 2]};
        const b: FilterNode = {field: "tier", cmp: "in", value: [1, 2, 2]};
        assert.equal(filtersEqual(a, b), false);
        assert.equal(filtersEqual(a, {field: "tier", cmp: "in", value: [2, 1, 1]}), true);
    });

    it("is false for a different leaf value, field, or comparator", () => {
        const base: FilterNode = {field: "tier", cmp: "eq", value: 4};
        assert.equal(filtersEqual(base, {field: "tier", cmp: "eq", value: 5}), false);
        assert.equal(filtersEqual(base, {field: "skill", cmp: "eq", value: 4}), false);
        assert.equal(filtersEqual(base, {field: "tier", cmp: "neq", value: 4}), false);
    });

    it("is false when one tree has an extra child the other doesn't", () => {
        const a = openWorkFilter();
        const b = quickWorkFilter({skills: [1], tiers: []});
        assert.equal(filtersEqual(a, b), false);
    });
});

describe("wouldMatchIfOpen", () => {
    it("agrees with evaluateFilter when the craft is not complete", () => {
        const filter = openWorkFilter();
        assert.equal(wouldMatchIfOpen(filter, craft()), evaluateFilter(filter, craft()));
        const notPublic = craft({public: false});
        assert.equal(wouldMatchIfOpen(filter, notPublic), evaluateFilter(filter, notPublic));
    });

    it("reports a match for a craft that finished but is otherwise still open work", () => {
        // `openWorkFilter()` excludes complete crafts by design, so `evaluateFilter` alone can't
        // distinguish "finished" from "no longer open work for some other reason" once a craft
        // crosses that line — that's the whole reason this function exists.
        const filter = openWorkFilter();
        const finished = craft({complete: true});
        assert.equal(evaluateFilter(filter, finished), false, "a completed craft is not open work");
        assert.equal(wouldMatchIfOpen(filter, finished), true, "but it would still match if it hadn't finished");
    });

    it("stays false when something else also stopped matching", () => {
        // The craft finished *and* went private in the same transition — completion is not the
        // only reason it dropped out, so this must not read as a clean "finished".
        const filter = openWorkFilter();
        const finishedAndPrivate = craft({complete: true, public: false});
        assert.equal(wouldMatchIfOpen(filter, finishedAndPrivate), false);
    });

    it("is a no-op for filters that don't care about completeness", () => {
        assert.equal(wouldMatchIfOpen(matchAll(), craft({complete: true})), true);
        const tierOnly: FilterNode = {field: "tier", cmp: "eq", value: 4};
        assert.equal(wouldMatchIfOpen(tierOnly, craft({complete: true, tier: 4})), true);
        assert.equal(wouldMatchIfOpen(tierOnly, craft({complete: true, tier: 5})), false);
    });
});

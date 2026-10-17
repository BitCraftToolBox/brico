/**
 * registry.test.ts — round-trip tests for `buildCommandTree`/`resolveCommand` in both modes.
 */
import type {APIChatInputApplicationCommandInteraction} from "discord-api-types/v10";
import {ApplicationCommandOptionType, InteractionType} from "discord-api-types/v10";
import assert from "node:assert/strict";
import {test} from "node:test";

import {commands} from "./index.ts";
import type {LeafCommand} from "./registry.ts";
import {buildCommandTree, leavesForScope, resolveCommand, resolveModalLeaf} from "./registry.ts";

const noop: LeafCommand["handler"] = async () => ({content: "ok"});

const LEAVES: LeafCommand[] = [
    {path: ["link"], description: "Link your Discord account.", handler: noop},
    {path: ["watch", "display"], description: "Show a live craft watch.", handler: noop},
    {path: ["watch", "notify"], description: "Get notified when a watch fires.", handler: noop},
];

/** Builds the `options` chain Discord would send for a command invoked as `fullPath.join(" ")` —
 * the last remaining segment is always a bare `Subcommand`, anything before it a `SubcommandGroup`
 * wrapping the next segment (matches Discord's own two-level nesting limit). */
function buildOptions(remaining: string[]): any[] | undefined {
    if (remaining.length === 0) return undefined;
    const [head, ...rest] = remaining;
    if (rest.length === 0) return [{type: ApplicationCommandOptionType.Subcommand, name: head}];
    return [{type: ApplicationCommandOptionType.SubcommandGroup, name: head, options: buildOptions(rest)}];
}

function interactionFor(fullPath: string[]): APIChatInputApplicationCommandInteraction {
    const [name, ...remaining] = fullPath;
    return {
        type: InteractionType.ApplicationCommand,
        data: {name, options: buildOptions(remaining)},
    } as unknown as APIChatInputApplicationCommandInteraction;
}

test("flat mode: a lone leaf becomes a bare command", () => {
    const tree = buildCommandTree([LEAVES[0]], "flat");
    assert.equal(tree.length, 1);
    assert.equal(tree[0].name, "link");
    assert.equal(tree[0].options, undefined);
});

test("flat mode: sibling leaves under one path segment become subcommands", () => {
    const tree = buildCommandTree(LEAVES, "flat");
    const names = tree.map(c => c.name).sort();
    assert.deepEqual(names, ["link", "watch"]);

    const watch = tree.find(c => c.name === "watch")!;
    const subNames = (watch.options ?? []).map((o: any) => o.name).sort();
    assert.deepEqual(subNames, ["display", "notify"]);
    for (const option of watch.options ?? []) {
        assert.equal((option as any).type, ApplicationCommandOptionType.Subcommand);
    }
});

test("grouped mode: everything nests under one top-level command", () => {
    const tree = buildCommandTree(LEAVES, "grouped", "brico");
    assert.equal(tree.length, 1);
    assert.equal(tree[0].name, "brico");

    const topNames = (tree[0].options ?? []).map((o: any) => o.name).sort();
    assert.deepEqual(topNames, ["link", "watch"]);

    const watchGroup = (tree[0].options ?? []).find((o: any) => o.name === "watch") as any;
    assert.equal(watchGroup.type, ApplicationCommandOptionType.SubcommandGroup);
    assert.deepEqual(watchGroup.options.map((o: any) => o.name).sort(), ["display", "notify"]);
});

test("resolveCommand finds a leaf via a flat-mode-shaped interaction", () => {
    const interaction = interactionFor(["watch", "display"]);
    const found = resolveCommand(LEAVES, interaction);
    assert.equal(found?.path.join("."), "watch.display");
});

test("resolveCommand finds the same leaf via a grouped-mode-shaped interaction", () => {
    const interaction = interactionFor(["brico", "watch", "display"]);
    const found = resolveCommand(LEAVES, interaction, "brico");
    assert.equal(found?.path.join("."), "watch.display");
});

test("resolveCommand returns null for an unregistered command", () => {
    const interaction = interactionFor(["nope"]);
    assert.equal(resolveCommand(LEAVES, interaction), null);
});

test("buildCommandTree rejects a path deeper than two segments", () => {
    const deep: LeafCommand[] = [{path: ["a", "b", "c"], description: "x", handler: noop}];
    assert.throws(() => buildCommandTree(deep, "flat"));
});

test("resolveModalLeaf matches an exact custom_id", () => {
    const leaves: LeafCommand[] = [{path: ["watch", "display"], description: "x", handler: noop, modalCustomId: "watch_display_setup"}];
    assert.equal(resolveModalLeaf(leaves, "watch_display_setup"), leaves[0]);
});

test("resolveModalLeaf matches a `modalCustomId:context` suffix, for a modal with no room for its own context field", () => {
    const leaves: LeafCommand[] = [{path: ["watch", "notify-setup"], description: "x", handler: noop, modalCustomId: "watch_notify_setup"}];
    assert.equal(resolveModalLeaf(leaves, "watch_notify_setup:filter-abc-123"), leaves[0]);
});

test("resolveModalLeaf does not match an unrelated custom_id sharing only a prefix", () => {
    const leaves: LeafCommand[] = [{path: ["watch", "display"], description: "x", handler: noop, modalCustomId: "watch_display_setup"}];
    assert.equal(resolveModalLeaf(leaves, "watch_display_setup_other"), null);
});

test("leavesForScope keeps unscoped leaves in both scopes and scoped leaves in only their own", () => {
    const leaves: LeafCommand[] = [
        {path: ["both"], description: "x", handler: noop},
        {path: ["guild-only"], description: "x", handler: noop, scope: "guild"},
        {path: ["dm-only"], description: "x", handler: noop, scope: "dm"},
    ];
    assert.deepEqual(leavesForScope(leaves, "guild").map(l => l.path[0]), ["both", "guild-only"]);
    assert.deepEqual(leavesForScope(leaves, "dm").map(l => l.path[0]), ["both", "dm-only"]);
});

test("the real registered command set builds cleanly in both modes for each scope", () => {
    for (const scope of ["guild", "dm"] as const) {
        const scoped = leavesForScope(commands, scope);
        assert.doesNotThrow(() => buildCommandTree(scoped, "flat"));
        assert.doesNotThrow(() => buildCommandTree(scoped, "grouped"));
    }
});

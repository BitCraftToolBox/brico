/**
 * Tests for the Discord watch display template renderer.
 */
import assert from "node:assert/strict";
import {test} from "node:test";
import {composeTemplateFromPresets} from "./discord-display.ts";
import {type DiscordTemplateContext, formatCompact, renderDiscordTemplate} from "./discord-template.ts";

function ctx(overrides: Partial<DiscordTemplateContext> = {}): DiscordTemplateContext {
    return {
        recipeName: "Peerless Spool of Thread",
        craftId: "123",
        frontendOrigin: "https://brico.app",
        ownerName: "Vasus",
        claimName: "Notsolis",
        regionId: 14,
        tier: 2,
        skillName: "Tailoring",
        effortTotal: 100,
        effortRemaining: 15,
        payout: 1 / 15.3,
        currency: "hex-coin",
        filterName: "Open work",
        mentionText: null,
        ...overrides,
    };
}

test("formatCompact abbreviates large numbers", () => {
    assert.equal(formatCompact(10_900_000), "10.9M");
    assert.equal(formatCompact(124_000), "124K");
    assert.equal(formatCompact(42), "42");
});

test("renderDiscordTemplate substitutes every known token", () => {
    assert.equal(
        renderDiscordTemplate("{craft:link}", ctx()),
        "[Peerless Spool of Thread](<https://brico.app/tools/crafts/123>)",
    );
    assert.equal(renderDiscordTemplate("{username}", ctx()), "Vasus");
    assert.equal(renderDiscordTemplate("{claim}", ctx()), "Notsolis");
    assert.equal(renderDiscordTemplate("{region:short}", ctx()), "(R14)");
    assert.equal(renderDiscordTemplate("{tier:short}", ctx()), "T2");
    assert.equal(renderDiscordTemplate("{skill}", ctx()), "Tailoring");
    assert.equal(renderDiscordTemplate("{remaining:short}", ctx({effortRemaining: 10_900_000})), "10.9M");
    assert.equal(renderDiscordTemplate("{progress:percent}", ctx({effortTotal: 100, effortRemaining: 15})), "85%");
    assert.equal(renderDiscordTemplate("{bounty:effort}", ctx({payout: 1 / 15.3, currency: "hex-coin"})), "15.3 effort/<:HexCoin:1555600295235559514>");
    assert.equal(renderDiscordTemplate("{payout:remaining}", ctx({payout: 1 / 15.3, effortRemaining: 124_000})), "8.1K");
    assert.equal(renderDiscordTemplate("{filterName}", ctx()), "Open work");
    assert.equal(renderDiscordTemplate("{mention}", ctx({mentionText: "<@123>"})), "<@123>");
});

test("renderDiscordTemplate resolves {mention} to an empty string when no mentionable is configured", () => {
    assert.equal(renderDiscordTemplate("{mention} hello", ctx({mentionText: null})), " hello");
});

test("renderDiscordTemplate falls back to a dash for absent optional facts", () => {
    assert.equal(renderDiscordTemplate("{username}", ctx({ownerName: null})), "—");
    assert.equal(renderDiscordTemplate("{claim}", ctx({claimName: null})), "—");
    assert.equal(renderDiscordTemplate("{tier:short}", ctx({tier: null})), "—");
    assert.equal(renderDiscordTemplate("{skill}", ctx({skillName: null})), "—");
    assert.equal(renderDiscordTemplate("{bounty:effort}", ctx({payout: null})), "—");
    assert.equal(renderDiscordTemplate("{payout:remaining}", ctx({payout: null})), "—");
});

test("renderDiscordTemplate leaves an unrecognized token as literal text", () => {
    assert.equal(renderDiscordTemplate("before {nonsense} after", ctx()), "before {nonsense} after");
});

test("renderDiscordTemplate reproduces the full example layout from all four presets", () => {
    const template = composeTemplateFromPresets(["ownerLocation", "tierSkill", "effortProgress", "bountyPayout"]);
    const rendered = renderDiscordTemplate(template, ctx({effortTotal: 100, effortRemaining: 20, payout: 0.1}));
    assert.equal(
        rendered,
        [
            "**Peerless Spool of Thread [↗](<https://brico.app/tools/crafts/123>)**",
            "Vasus · Notsolis (R14)",
            "T2 Tailoring",
            "Effort left: 20 · 80% done",
            "Bounty: 10 effort/<:HexCoin:1555600295235559514> · 2 left",
        ].join("\n"),
    );
});

test("composeTemplateFromPresets always uses canonical order regardless of input order", () => {
    const template = composeTemplateFromPresets(["bountyPayout", "ownerLocation"]);
    assert.equal(
        template,
        ["**{craft:name} {link}**", "{username} · {claim} {region:short}", "Bounty: {bounty:effort} · {payout:remaining} left"].join("\n"),
    );
});

test("composeTemplateFromPresets with no presets is just the craft link", () => {
    assert.equal(composeTemplateFromPresets([]), "**{craft:name} {link}**");
});

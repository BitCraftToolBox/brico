import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {encodeNotificationPayload, type NotificationPayload, parseNotificationPayload} from "./notification.ts";

describe("parseNotificationPayload", () => {
    it("round-trips craft and funding payloads", () => {
        const craft: NotificationPayload = {
            tag: "craft",
            value: {watchId: "w", filterName: "f", eventKind: "added", craftId: "42", recipeId: 7, regionName: "R", claimName: "C"},
        };
        const funding: NotificationPayload = {tag: "funding", value: {kind: "funding-failed", role: "payer", currency: "stelo", amount: "12"}};
        assert.deepEqual(parseNotificationPayload(encodeNotificationPayload(craft)), craft);
        assert.deepEqual(parseNotificationPayload(encodeNotificationPayload(funding)), funding);
    });

    it("discards unknown tags, bad shapes and malformed JSON", () => {
        assert.equal(parseNotificationPayload(JSON.stringify({tag: "bounty", value: {}})), null);
        assert.equal(parseNotificationPayload(JSON.stringify({tag: "funding", value: {kind: "x"}})), null);
        assert.equal(parseNotificationPayload(JSON.stringify({tag: "craft"})), null);
        assert.equal(parseNotificationPayload("not json"), null);
        assert.equal(parseNotificationPayload("null"), null);
    });
});

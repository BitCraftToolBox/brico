/**
 * prism.test.ts — `readSnapshot` against a fake connection.
 */
import type {DbConnection} from "@brico/bindings/prism";
import assert from "node:assert/strict";
import {test} from "node:test";

import {readSnapshot} from "./prism.ts";

function fakeConnection() {
    const table = (rows: unknown[]) => ({iter: () => rows});
    return {
        db: {
            craftMeta: table([{entityId: 1n, status: {tag: "Active"}}, {entityId: 2n, status: {tag: "Claimed"}}]),
            craftProgress: table([{entityId: 1n, progress: 5}]),
            claimInfo: table([{entityId: 10n, name: "claim"}]),
            claimMember: table([
                {claimEntityId: 10n, playerEntityId: 20n, owner: true},
                {claimEntityId: 10n, playerEntityId: 21n, owner: false},
                {claimEntityId: 10n, playerEntityId: 22n, owner: true},
            ]),
            craftContribution: table([{craftId: 1n, playerId: 20n, contribution: 3}]),
            playerState: table([{entityId: 20n, name: "someone"}]),
            region: table([{id: 1, name: "region"}]),
        },
    } as unknown as DbConnection;
}

test("readSnapshot keeps only open crafts in `crafts` but every craft id, and lists claim owners in table order", () => {
    const snapshot = readSnapshot(fakeConnection());
    assert.deepEqual(snapshot.crafts.map(craft => craft.entityId), [1n]);
    assert.deepEqual([...snapshot.allCraftIds], [1n, 2n]);
    assert.deepEqual(snapshot.claimOwners.get(10n), [20n, 22n]);
    assert.equal(snapshot.claimMembers.size, 3);
    assert.equal(snapshot.contributions.get(1n)?.get(20n), 3n);
    assert.equal(snapshot.players.get(20n)?.name, "someone");
    assert.equal(snapshot.regions.get(1)?.name, "region");
});

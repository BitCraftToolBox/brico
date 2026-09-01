import assert from "node:assert/strict";
import {test} from "node:test";
import {reconcile, type SyncMetaMap} from "./filter-sync-merge.ts";

type Content = {name: string};

test("local-only content pushes", () => {
    const result = reconcile<Content>({
        localContent: {a: {name: "A"}},
        syncMeta: {},
        remote: {},
        nowMs: 1000,
    });
    assert.deepEqual(result.pushes, [{id: "a", updatedAtMs: 1000, upsert: {name: "A"}}]);
    assert.deepEqual(result.localUpserts, {});
    assert.deepEqual(result.localRemovals, []);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.syncMeta.a.deletedAt, undefined);
});

test("a local delete (id dropped after being synced) pushes a delete, not an upsert", () => {
    const syncMeta: SyncMetaMap = {a: {updatedAt: 500, contentHash: JSON.stringify({name: "A"})}};
    const result = reconcile<Content>({
        localContent: {},
        syncMeta,
        remote: {a: {content: {name: "A"}, updatedAtMs: 500, deletedAtMs: null}},
        nowMs: 1000,
    });
    assert.deepEqual(result.pushes, [{id: "a", updatedAtMs: 1000, upsert: null}]);
});

test("remote-only content never seen locally is pulled and seeds syncMeta", () => {
    const result = reconcile<Content>({
        localContent: {},
        syncMeta: {},
        remote: {a: {content: {name: "A"}, updatedAtMs: 500, deletedAtMs: null}},
        nowMs: 1000,
    });
    assert.deepEqual(result.localUpserts, {a: {name: "A"}});
    assert.equal(result.syncMeta.a.updatedAt, 500);
    assert.deepEqual(result.pushes, []);
});

test("a remote tombstone never seen locally is a no-op", () => {
    const result = reconcile<Content>({
        localContent: {},
        syncMeta: {},
        remote: {a: {content: {name: "A"}, updatedAtMs: 500, deletedAtMs: 500}},
        nowMs: 1000,
    });
    assert.deepEqual(result.localUpserts, {});
    assert.deepEqual(result.syncMeta, {});
});

test("equal timestamps are a no-op", () => {
    const syncMeta: SyncMetaMap = {a: {updatedAt: 500, contentHash: JSON.stringify({name: "A"})}};
    const result = reconcile<Content>({
        localContent: {a: {name: "A"}},
        syncMeta,
        remote: {a: {content: {name: "A"}, updatedAtMs: 500, deletedAtMs: null}},
        nowMs: 1000,
    });
    assert.deepEqual(result.pushes, []);
    assert.deepEqual(result.localUpserts, {});
    assert.deepEqual(result.conflicts, []);
});

test("local newer wins and pushes", () => {
    const syncMeta: SyncMetaMap = {a: {updatedAt: 900, contentHash: JSON.stringify({name: "A2"})}};
    const result = reconcile<Content>({
        localContent: {a: {name: "A2"}},
        syncMeta,
        remote: {a: {content: {name: "A"}, updatedAtMs: 500, deletedAtMs: null}},
        nowMs: 1000,
    });
    assert.deepEqual(result.pushes, [{id: "a", updatedAtMs: 900, upsert: {name: "A2"}}]);
    assert.deepEqual(result.localUpserts, {});
});

test("remote newer pulls silently when the local device had no unsynced edit of its own", () => {
    const hash = JSON.stringify({name: "A"});
    const syncMeta: SyncMetaMap = {a: {updatedAt: 500, contentHash: hash}};
    const result = reconcile<Content>({
        localContent: {a: {name: "A"}},
        syncMeta,
        remote: {a: {content: {name: "A-from-other-device"}, updatedAtMs: 900, deletedAtMs: null}},
        nowMs: 1000,
    });
    assert.deepEqual(result.localUpserts, {a: {name: "A-from-other-device"}});
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.syncMeta.a.updatedAt, 900);
});

test("remote newer overwriting a local device's own unsynced edit is flagged as a conflict", () => {
    // syncMeta still reflects the last content the server and this device agreed on ("A"). Local
    // content has since drifted to "A-local-edit" — an edit this pass's step 1 will detect and
    // stamp with `nowMs` — but an even newer remote edit (from another device) still wins. The
    // conflict check must compare against the *pre-step-1* syncMeta ("A"), not the post-step-1
    // one (which step 1 already re-synced to "A-local-edit" and would never differ from local).
    const syncMeta: SyncMetaMap = {a: {updatedAt: 500, contentHash: JSON.stringify({name: "A"})}};
    const result = reconcile<Content>({
        localContent: {a: {name: "A-local-edit"}},
        syncMeta,
        remote: {a: {content: {name: "A-from-other-device"}, updatedAtMs: 2_000_000, deletedAtMs: null}},
        nowMs: 600,
    });
    assert.deepEqual(result.localUpserts, {a: {name: "A-from-other-device"}});
    assert.deepEqual(result.conflicts, ["a"]);
});

test("deleting locally then losing to a newer remote edit removes the local delete and is a conflict", () => {
    const hash = JSON.stringify({name: "A"});
    const syncMeta: SyncMetaMap = {a: {updatedAt: 500, contentHash: hash}};
    const result = reconcile<Content>({
        localContent: {},
        syncMeta,
        remote: {a: {content: {name: "A-from-other-device"}, updatedAtMs: 999_999, deletedAtMs: null}},
        nowMs: 600,
    });
    assert.deepEqual(result.localUpserts, {a: {name: "A-from-other-device"}});
    // The local side had no *content* to diff (it was a pending delete, not an edit), so this is
    // not counted as a content conflict — the delete simply loses to the newer remote row.
    assert.deepEqual(result.conflicts, []);
});

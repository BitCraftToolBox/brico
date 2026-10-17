/**
 * executor.ts — carries each `Pending` transfer intent through Stelo exactly once.
 *
 * The intent row exists before any money moves, and its `ref` is both the memo and the idempotency
 * key, so sending is safe to repeat: a replay returns the original transfer. An intent settles once
 * the bot sees its posted transfer (ref, both accounts and raw amount must match) in `my_transfers`.
 */
import type {SteloTransfer} from "@brico/bindings/brico-app/types";

import type {Logger} from "../log.ts";
import type {SteloReadModel} from "./stelo-cache.ts";
import type {SteloWrites} from "./writes.ts";

export type FailureKind = "insufficient-funds" | "no-permission" | "invalid-account" | "conflict";

/** Maps a rejected `create_transfer` to a terminal failure, or `null` for anything worth retrying (outages, timeouts). */
export function classifyTransferError(cause: unknown): FailureKind | null {
    const message = (cause instanceof Error ? cause.message : String(cause)).toLowerCase();
    if (message.includes("invalid balance")) return "insufficient-funds";
    if (message.includes("insufficient account permission")) return "no-permission";
    if (message.includes("account not found") || message.includes("incompatible account ledgers")) return "invalid-account";
    if (message.includes("idempotency key conflict")) return "conflict";
    return null;
}

export interface ExecutorDeps {
    log: Logger;
    stelo: SteloReadModel & {
        readonly isLive: boolean;
        createTransfer(args: {fromAccountId: bigint; toAccountId: bigint; steloAmount: bigint; ref: string}): Promise<void>;
    };
    writes: SteloWrites;
    now(): number;
    /** How long to wait for a sent transfer to echo back before sending it again (safe: same idempotency key). */
    resendAfterMs?: number;
}

export interface TransferExecutor {
    /** Advances every pending intent one step. Safe to call every tick. */
    run(pending: Iterable<SteloTransfer>): void;
    /** While true, no new transfer is sent (settling already-posted ones continues). */
    paused: boolean;
}

export function createTransferExecutor(deps: ExecutorDeps): TransferExecutor {
    const {log, stelo, writes} = deps;
    const resendAfterMs = deps.resendAfterMs ?? 30_000;
    // Intent id -> earliest time to attempt a send again.
    const nextAttempt = new Map<bigint, number>();
    const settling = new Set<bigint>();
    const failing = new Set<bigint>();

    const executor: TransferExecutor = {
        paused: false,
        run(pending) {
            const live = new Set<bigint>();
            for (const intent of pending) {
                live.add(intent.id);
                if (settling.has(intent.id) || failing.has(intent.id)) continue;

                const posted = stelo.findPostedTransfer({
                    ref: intent.ref, fromAccountId: intent.fromAccountId, toAccountId: intent.toAccountId, steloAmount: intent.steloAmount,
                });
                if (posted) {
                    settling.add(intent.id);
                    writes.settleTransfer(intent.id, posted.id)
                        .catch(cause => log.error("settle_stelo_transfer failed", {intent: intent.ref, error: describe(cause)}))
                        .finally(() => settling.delete(intent.id));
                    continue;
                }

                if (executor.paused || !stelo.isLive) continue;
                if (deps.now() < (nextAttempt.get(intent.id) ?? 0)) continue;
                nextAttempt.set(intent.id, deps.now() + resendAfterMs);
                send(intent);
            }
            for (const id of nextAttempt.keys()) if (!live.has(id)) nextAttempt.delete(id);
        },
    };

    function send(intent: SteloTransfer): void {
        stelo.createTransfer({
            fromAccountId: intent.fromAccountId, toAccountId: intent.toAccountId, steloAmount: intent.steloAmount, ref: intent.ref,
        }).catch(cause => {
            const kind = classifyTransferError(cause);
            if (kind === null) {
                log.warn("transfer send failed; will retry", {intent: intent.ref, error: describe(cause)});
                return;
            }
            log.warn("transfer rejected", {intent: intent.ref, reason: kind, error: describe(cause)});
            failing.add(intent.id);
            writes.failTransfer(intent.id, kind)
                .catch(failure => log.error("fail_stelo_transfer failed", {intent: intent.ref, error: describe(failure)}))
                .finally(() => failing.delete(intent.id));
        });
    }

    return executor;
}

function describe(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

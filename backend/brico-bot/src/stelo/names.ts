/**
 * names.ts — resolves a brico account to the name shown for it in alerts and transfer memos.
 */
import type {Identity} from "spacetimedb";

import type {BricoAppConnection} from "../app/connection.ts";

export interface PlayerNames {
    player(playerId: bigint): string | undefined;
    playerAccounts(): ReadonlyMap<bigint, Identity>;
}

/** The account's display name, else the name of its first linked player. */
export function accountName(app: BricoAppConnection, names: PlayerNames | undefined, account: Identity): string | undefined {
    const conn = app.connection?.connection;
    if (conn?.isActive) {
        const acc = conn.db.allAccount.identity.find(account);
        if (acc && acc.displayName) return acc.displayName;
    }
    if (!names) return undefined;
    for (const [playerId, owner] of names.playerAccounts()) {
        const name = owner.isEqual(account) ? names.player(playerId) : undefined;
        if (name) return name;
    }
    return undefined;
}

import type {Identity, Timestamp} from 'spacetimedb';
import type {ReadDb} from '../schema';

/** The `account_permission` columns that restrict an account until a time. */
export type Restriction = 'postBlockedUntil' | 'reviewRequiredUntil' | 'nameLockedUntil' | 'reportBlockedUntil';

/** Whether `identity` is under `restriction` at `now`. */
export function isRestricted(db: ReadDb, identity: Identity, restriction: Restriction, now: Timestamp): boolean {
    const until = db.account_permission.identity.find(identity)?.[restriction];
    return until !== undefined && now.microsSinceUnixEpoch < until.microsSinceUnixEpoch;
}

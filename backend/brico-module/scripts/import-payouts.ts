#!/usr/bin/env -S npx tsx
// @ts-nocheck
// Imports one payer's historical `bounty_entitlement_total` / `bounty_payout_record` rows from
// spreadsheet CSV exports via the service-principal-gated `import_historical_bounty_ledger`
// reducer (`spacetimedb/src/reducers/payouts.ts`), using the generated bindings + SpacetimeDB SDK
// directly rather than shelling out to the `spacetime` CLI — the whole CSV goes over in one
// reducer call instead of one `spacetime call` per row.
//
// The connecting identity must already be registered as a service principal (see
// `register_service_principal`); the first run against a fresh identity prints the exact command
// to do that and exits.
//
// Usage (from this directory, or `backend/brico-module/spacetimedb` via `npm run import:payouts --`):
//   npx tsx import-payouts.ts <payer-identity-hex> [options]
//
// Options:
//   --entitled-and-paid=<path>  entityId,name,totalEffort,coins,paidOut CSV (default: entitled_and_paid.csv)
//   --host=<uri>                SpacetimeDB host URI (default: http://127.0.0.1:3000)
//   --database=<name>           module/database name (default: brico-app)
//   --token-file=<path>         where to persist this script's own connection identity's auth token
//                               (default: .import-payouts.token next to this script)
//   --dry-run                   parse and print the rows without connecting or calling the reducer

import {DbConnection} from '@brico/bindings/brico-app';
import type {HistoricalBountyLedgerRow} from '@brico/bindings/brico-app/types';
import * as fs from 'node:fs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Identity} from 'spacetimedb';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// Hardcoded, not a flag: every historical sheet here is denominated in hex-coin, and the reducers
// only allow-list currencies that are ever meant to be manually recorded (see `validateBountyCurrency`
// / `validateManualBountyCurrency` in `spacetimedb/src/lib/bounty.ts`).
const CURRENCY = 'hex-coin';

interface Options {
    entitledAndPaid: string;
    host: string;
    database: string;
    tokenFile: string;
    dryRun: boolean;
    payerIdentity: string;
}

function parseArgs(argv: readonly string[]): Options {
    const options = {
        entitledAndPaid: path.join(scriptDir, 'entitled_and_paid.csv'),
        host: 'http://127.0.0.1:3000',
        database: 'brico-app',
        tokenFile: path.join(scriptDir, '.import-payouts.token'),
        dryRun: false,
    };
    const positional: string[] = [];
    for (const arg of argv) {
        if (arg === '--dry-run') options.dryRun = true;
        else if (arg.startsWith('--entitled-and-paid=')) options.entitledAndPaid = arg.slice('--entitled-and-paid='.length);
        else if (arg.startsWith('--host=')) options.host = arg.slice('--host='.length);
        else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length);
        else if (arg.startsWith('--token-file=')) options.tokenFile = arg.slice('--token-file='.length);
        else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
        else positional.push(arg);
    }
    if (positional.length !== 1) {
        throw new Error(
            'usage: import-payouts.ts <payer-identity-hex> [--entitled-and-paid=path] ' +
            '[--host=uri] [--database=name] [--token-file=path] [--dry-run]'
        );
    }
    return {...options, payerIdentity: normalizeIdentity(positional[0])};
}

function normalizeIdentity(raw: string): string {
    const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error(`not a 64-hex-character identity: ${raw}`);
    }
    return hex.toLowerCase();
}

/**
 * Parses a u64 player id, rejecting anything but a plain integer literal — in particular the
 * scientific notation (e.g. "5.76461E+17") a spreadsheet produces for a cell it auto-formatted as a
 * number, which has already thrown away the digits needed to recover the real id. Kept as a string,
 * never round-tripped through `Number`, since these ids routinely exceed `Number.MAX_SAFE_INTEGER`.
 */
function parsePlayerId(raw: string): bigint | null {
    const trimmed = raw.trim();
    return /^[0-9]+$/.test(trimmed) ? BigInt(trimmed) : null;
}

/**
 * Floors an arbitrary-precision decimal string to a bigint (toward -Infinity), via exact string/
 * bigint arithmetic. `Math.floor(Number(str))` would round-trip through a 64-bit float, which is
 * exact for every value these sheets actually contain, but floors ties on negative values the wrong
 * way if it's ever off by an ULP — doing it on the digit string sidesteps the question entirely.
 */
function floorDecimalToBigInt(raw: string | undefined): bigint {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') return 0n;
    const negative = trimmed.startsWith('-');
    const abs = negative ? trimmed.slice(1) : trimmed;
    const [intPart, fracPart = ''] = abs.split('.');
    const intValue = BigInt(intPart === '' ? '0' : intPart);
    if (!negative) return intValue;
    const hasFraction = /[1-9]/.test(fracPart);
    return hasFraction ? -(intValue + 1n) : -intValue;
}

/** No quoted fields in these exports (names are ignored, so a stray comma in one doesn't matter). */
function parseCsv(filePath: string): {rows: string[][]; columnIndex: (name: string) => number} {
    if (!fs.existsSync(filePath)) return {rows: [], columnIndex: () => 0};
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    const header = lines[0].split(',').map(cell => cell.trim());
    const rows = lines.slice(1).map(line => line.split(','));
    const columnIndex = (name: string) => {
        const index = header.indexOf(name);
        if (index === -1) throw new Error(`${filePath}: missing expected column "${name}" (found: ${header.join(', ')})`);
        return index;
    };
    return {rows, columnIndex};
}

function buildRows(options: Options): {rows: HistoricalBountyLedgerRow[]; skipped: number} {
    const {rows: csvRows, columnIndex} = parseCsv(options.entitledAndPaid);
    const idCol = columnIndex('entityId');
    const effortCol = columnIndex('totalEffort');
    const coinsCol = columnIndex('coins');
    const paidCol = columnIndex('paidOut');

    const rows: HistoricalBountyLedgerRow[] = [];
    let skipped = 0;
    for (const row of csvRows) {
        const payeePlayerId = parsePlayerId(row[idCol] ?? '');
        if (payeePlayerId === null) {
            console.warn(`entitled_and_paid: skipping row with unusable player id: ${row.join(',')}`);
            skipped++;
            continue;
        }
        rows.push({
            payeePlayerId,
            currency: CURRENCY,
            totalEffort: floorDecimalToBigInt(row[effortCol]),
            total: floorDecimalToBigInt(row[coinsCol]),
            paidTotal: floorDecimalToBigInt(row[paidCol]),
        });
    }
    return {rows, skipped};
}

/** Same file-based, 0600 persistence `backend/brico-bot` uses for its own connection tokens. */
function readToken(tokenFile: string): string | undefined {
    try {
        const token = readFileSync(tokenFile, 'utf8').trim();
        return token === '' ? undefined : token;
    } catch {
        return undefined;
    }
}

function writeToken(tokenFile: string, token: string): void {
    fs.writeFileSync(tokenFile, token, {encoding: 'utf8', mode: 0o600});
}

interface Connected {
    conn: DbConnection;
    identityHex: string;
}

function connect(options: Options): Promise<Connected> {
    return new Promise((resolve, reject) => {
        DbConnection.builder()
            .withUri(options.host)
            .withDatabaseName(options.database)
            .withToken(readToken(options.tokenFile))
            .onConnect((conn, identity, token) => {
                writeToken(options.tokenFile, token);
                const identityHex = identity.toHexString();
                console.log(`connected as ${identityHex}`);
                resolve({conn, identityHex});
            })
            .onConnectError((_ctx, error) => {
                reject(new Error(`connect error: ${error?.message ?? 'unknown'}`));
            })
            .build();
    });
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const {rows, skipped} = buildRows(options);

    if (options.dryRun) {
        console.log(`bounty ledger: would import ${rows.length} row(s) for payer ${options.payerIdentity}, ${skipped} skipped`);
        for (const row of rows) {
            console.log(JSON.stringify({
                payeePlayerId: row.payeePlayerId.toString(),
                currency: row.currency,
                totalEffort: row.totalEffort.toString(),
                total: row.total.toString(),
                paidTotal: row.paidTotal.toString(),
            }));
        }
        return;
    }

    if (rows.length === 0) {
        console.log(`bounty ledger: nothing to import (${skipped} skipped)`);
        return;
    }

    const {conn, identityHex} = await connect(options);
    try {
        await conn.reducers.importHistoricalBountyLedger({
            payerAccountIdentity: new Identity(options.payerIdentity),
            rows,
        });
        console.log(`bounty ledger: imported ${rows.length} row(s), ${skipped} skipped`);
    } catch (cause) {
        if (cause instanceof Error && cause.message === 'NOT_SERVICE_PRINCIPAL') {
            throw new Error(
                `this script's own identity (${identityHex}) is not a registered service principal — register it once with: ` +
                `spacetime call ${options.database} register_service_principal '"${identityHex}"' '"import-payouts"'`
            );
        }
        throw cause;
    } finally {
        conn.disconnect();
    }
}

try {
    await main();
} catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
}

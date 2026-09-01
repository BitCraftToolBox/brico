#!/usr/bin/env node
// Imports one payer's historical `bounty_entitlement_total` / `bounty_payout_record` /
// `loyalty_reward` rows from spreadsheet CSV exports (see `entitled_and_paid.csv`/`loyalty.csv` in
// this directory for the expected shape) via the service-principal-gated
// `import_historical_bounty_ledger` / `import_historical_loyalty_reward` reducers
// (`spacetimedb/src/reducers/payouts.ts`). Shells out to the `spacetime` CLI per row rather than
// opening an SDK connection — this is a one-off admin backfill, not a long-running process, and the
// CLI already carries the operator's own login identity (which must be a `service_principal`; the
// module publisher qualifies for free, see `backend/brico-bot/README.md`'s "Running as the database
// owner" note).
//
// Usage (from this directory, or `backend/brico-module/spacetimedb` via `npm run import:payouts --`):
//   node import-payouts.mjs <payer-identity-hex> [options]
//
// Options:
//   --entitled-and-paid=<path>  entityId,name,totalEffort,coins,paidOut CSV (default: entitled_and_paid.csv)
//   --loyalty=<path>            playerEntityId,name,multiplier CSV (default: loyalty.csv)
//   --server=<name>             spacetime CLI server nickname (default: local)
//   --database=<name>           spacetime database name (default: brico-app)
//   --dry-run                   print the `spacetime call` invocations instead of running them
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(scriptDir, '..');

// Hardcoded, not a flag: every historical sheet here is denominated in hex-coin, and the reducers
// only allow-list currencies that are ever meant to be manually recorded (see `validateBountyCurrency`
// / `validateManualBountyCurrency` in `spacetimedb/src/lib/bounty.ts`).
const CURRENCY = 'hex-coin';

function parseArgs(argv) {
    const options = {
        entitledAndPaid: path.join(scriptDir, 'entitled_and_paid.csv'),
        loyalty: path.join(scriptDir, 'loyalty.csv'),
        server: 'local',
        database: 'brico-app',
        dryRun: false,
    };
    const positional = [];
    for (const arg of argv) {
        if (arg === '--dry-run') options.dryRun = true;
        else if (arg.startsWith('--entitled-and-paid=')) options.entitledAndPaid = arg.slice('--entitled-and-paid='.length);
        else if (arg.startsWith('--loyalty=')) options.loyalty = arg.slice('--loyalty='.length);
        else if (arg.startsWith('--server=')) options.server = arg.slice('--server='.length);
        else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length);
        else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
        else positional.push(arg);
    }
    if (positional.length !== 1) {
        throw new Error(
            'usage: import-payouts.mjs <payer-identity-hex> [--entitled-and-paid=path] [--loyalty=path] ' +
            '[--server=name] [--database=name] [--dry-run]'
        );
    }
    options.payerIdentity = normalizeIdentity(positional[0]);
    return options;
}

function normalizeIdentity(raw) {
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
function parsePlayerId(raw) {
    const trimmed = raw.trim();
    return /^[0-9]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Floors an arbitrary-precision decimal string to a bigint (toward -Infinity), via exact string/
 * bigint arithmetic. `Math.floor(Number(str))` would round-trip through a 64-bit float, which is
 * exact for every value these sheets actually contain, but floors ties on negative values the wrong
 * way if it's ever off by an ULP — doing it on the digit string sidesteps the question entirely.
 */
function floorDecimalToBigInt(raw) {
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

/**
 * Converts a decimal multiplier string (e.g. "1.0225") to an exact integer ratio via string
 * splitting, so e.g. 1.0225 doesn't round-trip through float math into 1.0224999999999997.
 */
function decimalToRatio(raw) {
    const trimmed = raw.trim();
    if (!/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return null;
    const [intPart, fracPart = ''] = trimmed.split('.');
    if (fracPart === '') return {numerator: BigInt(intPart), denominator: 1n};
    return {numerator: BigInt(intPart + fracPart), denominator: 10n ** BigInt(fracPart.length)};
}

/** No quoted fields in these exports (names are ignored, so a stray comma in one doesn't matter). */
function parseCsv(filePath) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    const header = lines[0].split(',').map(cell => cell.trim());
    const rows = lines.slice(1).map(line => line.split(','));
    const columnIndex = name => {
        const index = header.indexOf(name);
        if (index === -1) throw new Error(`${filePath}: missing expected column "${name}" (found: ${header.join(', ')})`);
        return index;
    };
    return {rows, columnIndex};
}

/**
 * `--` before `call_parts` so a negative i64 argument (e.g. a paid-total correction) isn't parsed
 * as an unknown CLI flag by clap. No `shell: true` — args are passed straight through to the
 * process, so the embedded JSON-string quotes in `payerArg`/currency args need no manual escaping.
 */
function callReducer(options, reducer, args) {
    const cliArgs = ['call', '--server', options.server, '--', options.database, reducer, ...args];
    if (options.dryRun) {
        console.log(`spacetime ${cliArgs.join(' ')}`);
        return;
    }
    execFileSync('spacetime', cliArgs, {cwd: moduleDir, encoding: 'utf8'});
}

function describeFailure(cause) {
    const stderr = typeof cause?.stderr === 'string' ? cause.stderr : '';
    const errorLine = stderr.split('\n').map(line => line.trim()).find(line => line.startsWith('Error:'));
    if (errorLine) return errorLine;
    if (stderr.trim()) return stderr.trim();
    return cause instanceof Error ? cause.message : String(cause);
}

function importBountyLedger(options) {
    const {rows, columnIndex} = parseCsv(options.entitledAndPaid);
    const idCol = columnIndex('entityId');
    const effortCol = columnIndex('totalEffort');
    const coinsCol = columnIndex('coins');
    const paidCol = columnIndex('paidOut');
    const payerArg = JSON.stringify(options.payerIdentity);
    const currencyArg = JSON.stringify(CURRENCY);

    let imported = 0, skipped = 0, failed = 0;
    for (const row of rows) {
        const playerId = parsePlayerId(row[idCol] ?? '');
        if (playerId === null) {
            console.warn(`entitled_and_paid: skipping row with unusable player id: ${row.join(',')}`);
            skipped++;
            continue;
        }
        const totalEffort = floorDecimalToBigInt(row[effortCol]);
        const total = floorDecimalToBigInt(row[coinsCol]);
        const paidTotal = floorDecimalToBigInt(row[paidCol]);
        try {
            callReducer(options, 'import_historical_bounty_ledger', [
                payerArg, playerId, currencyArg, String(totalEffort), String(total), String(paidTotal),
            ]);
            imported++;
        } catch (cause) {
            console.error(`entitled_and_paid: failed for player ${playerId}: ${describeFailure(cause)}`);
            failed++;
        }
    }
    return {imported, skipped, failed};
}

function importLoyaltyRewards(options) {
    const {rows, columnIndex} = parseCsv(options.loyalty);
    const idCol = columnIndex('playerEntityId');
    const multiplierCol = columnIndex('multiplier');
    const payerArg = JSON.stringify(options.payerIdentity);
    const currencyArg = JSON.stringify(CURRENCY);

    let imported = 0, skipped = 0, failed = 0;
    for (const row of rows) {
        const playerId = parsePlayerId(row[idCol] ?? '');
        const ratio = decimalToRatio(row[multiplierCol] ?? '');
        if (playerId === null || ratio === null) {
            console.warn(`loyalty: skipping row with unusable data: ${row.join(',')}`);
            skipped++;
            continue;
        }
        try {
            callReducer(options, 'import_historical_loyalty_reward', [
                payerArg, playerId, currencyArg, String(ratio.numerator), String(ratio.denominator),
            ]);
            imported++;
        } catch (cause) {
            console.error(`loyalty: failed for player ${playerId}: ${describeFailure(cause)}`);
            failed++;
        }
    }
    return {imported, skipped, failed};
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const ledger = importBountyLedger(options);
    const loyalty = importLoyaltyRewards(options);

    console.log(`bounty ledger: ${ledger.imported} imported, ${ledger.skipped} skipped, ${ledger.failed} failed`);
    console.log(`loyalty reward: ${loyalty.imported} imported, ${loyalty.skipped} skipped, ${loyalty.failed} failed`);
    if (ledger.failed > 0 || loyalty.failed > 0) process.exitCode = 1;
}

try {
    main();
} catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
}

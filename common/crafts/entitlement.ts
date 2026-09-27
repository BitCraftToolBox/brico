/**
 * entitlement.ts — the payout math shared by `brico-bot`'s real ledger writes and the frontend's
 * "estimated payout" preview, so there is exactly one implementation of the floor-based rule, not
 * two hand-duplicated copies that could quietly drift apart.
 *
 * No floating point anywhere here — ratios and cumulative effort are always integers or exact
 * integer fractions (`bigint`), matching every other 64-bit quantity this package handles (see
 * `subject.ts`'s id-precision notes). A decimal ratio typed into the UI is parsed into a reduced
 * integer fraction by `parseDecimalRatio`'s exact decimal-string arithmetic, never through a float
 * round-trip.
 */

function gcd(a: bigint, b: bigint): bigint {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
        [x, y] = [y, x % y];
    }
    return x;
}

/** Reduces a non-negative fraction to lowest terms — `0` always reduces to `0/1`. */
export function reduceRatio(numerator: bigint, denominator: bigint): {numerator: bigint; denominator: bigint} {
    if (numerator === 0n) return {numerator: 0n, denominator: 1n};
    const divisor = gcd(numerator, denominator);
    return {numerator: numerator / divisor, denominator: denominator / divisor};
}

/**
 * Converts a multiplier (>=1, e.g. `1.025` for +2.5% — the shape every loyalty multiplier/bonus is
 * typed in and stored as) into a bonus-only fraction (e.g. `1/40`). Several bonuses (a manual
 * assignment plus any number of satisfied automated rules) must **add** — 2%+2.5%+1.5%+2%=8% — not
 * compound as multipliers (`1.02 x 1.025 x 1.015 x 1.02 =/= 1.08`), so every bonus source is
 * converted to this shape before summing (`addRatio`) and the sum is converted back to a multiplier
 * (`1 + bonus`) once, immediately before composing with a craft's bounty ratio.
 */
export function bonusFromMultiplier(numerator: bigint, denominator: bigint): {numerator: bigint; denominator: bigint} {
    return reduceRatio(numerator - denominator, denominator);
}

/** The inverse of `bonusFromMultiplier` — a bonus-only fraction back to a multiplier (e.g. `1/40` -> `41/40`, i.e. `1.025`), for displaying a stored bonus in the same "type 1.025" units a multiplier field edits. */
export function multiplierFromBonus(numerator: bigint, denominator: bigint): {numerator: bigint; denominator: bigint} {
    return reduceRatio(numerator + denominator, denominator);
}

/** Exact fraction addition (`a + b`), reduced — never through a float. */
export function addRatio(
    a: {numerator: bigint; denominator: bigint},
    b: {numerator: bigint; denominator: bigint},
): {numerator: bigint; denominator: bigint} {
    return reduceRatio(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

/**
 * A contributor's total entitlement off their own cumulative effort — a monotonic floor, never
 * negative-adjusted: `floor(cumulativeEffort × ratioNumerator / ratioDenominator)`.
 *
 * Each caller only ever pays the **delta** since that contributor's own last-recorded entitlement
 * (`craft_bounty_entitlement.entitledTotal`) — re-running this on the new cumulative effort and
 * subtracting the old result is always correct, with no separate "what changed" tracking needed.
 * Since each contributor's entitlement is floored independently off their own effort, the sum of
 * individually-floored entitlements can never exceed the craft's ideal total (floored off combined
 * effort) — `floor(a) + floor(b) ≤ floor(a + b)` for any real numbers — so this guarantees no
 * aggregate overpayment for free, with no largest-remainder or pot-splitting logic needed.
 */
export function computeEntitlement(cumulativeEffort: bigint, ratioNumerator: bigint, ratioDenominator: bigint): bigint {
    // bigint division truncates toward zero, which is exactly `floor` since every value here is
    // non-negative.
    return (cumulativeEffort * ratioNumerator) / ratioDenominator;
}

// The integer part is optional exactly when there's a fractional part to lead with instead — ".25"
// reads the same as "0.25" to anyone typing it, so it's accepted the same way; a bare "." (neither
// part present) is still rejected, and so is a trailing "." with no digits after it.
const DECIMAL_PATTERN = /^(\d+(\.\d+)?|\.\d+)$/;

/**
 * Parses a plain decimal string (e.g. `"0.4"` or `".4"`, typed into a ratio input) into an exact,
 * reduced integer fraction — by counting decimal places and scaling, never by round-tripping through
 * a float. Returns `null` for anything that isn't a bare non-negative decimal number (empty string,
 * multiple decimal points, a sign, non-digit characters).
 */
export function parseDecimalRatio(input: string): {numerator: bigint; denominator: bigint} | null {
    const trimmed = input.trim();
    if (!DECIMAL_PATTERN.test(trimmed)) return null;
    const [integerPart, fractionalPart] = trimmed.split(".");
    if (fractionalPart === undefined) return reduceRatio(BigInt(integerPart), 1n);
    // `integerPart` is `""` for a leading-dot input like ".25" — `BigInt("" + "25")` still parses
    // fine, so no special-casing is needed beyond the regex accepting the shape at all.
    return reduceRatio(BigInt(integerPart + fractionalPart), 10n ** BigInt(fractionalPart.length));
}

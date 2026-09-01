import {CraftError} from '@brico/crafts/errors';
import {BOUNTY_CURRENCIES, MANUALLY_RECORDED_BOUNTY_CURRENCIES} from '@brico/crafts/filter';
import {SenderError} from 'spacetimedb/server';

const BOUNTY_CURRENCY_SET = new Set(BOUNTY_CURRENCIES);
export function validateBountyCurrency(currency: string): void {
    if (!BOUNTY_CURRENCY_SET.has(currency)) {
        throw new SenderError(`${CraftError.UNKNOWN_CURRENCY}:${currency}`);
    }
}

const MANUAL_BOUNTY_CURRENCY_SET = new Set(MANUALLY_RECORDED_BOUNTY_CURRENCIES);
export function validateManualBountyCurrency(currency: string): void {
    if (!MANUAL_BOUNTY_CURRENCY_SET.has(currency)) {
        throw new SenderError(`${CraftError.UNKNOWN_CURRENCY}:${currency}`);
    }
}

/**
 * Every caller-writable ratio (`craft_bounty_override`, both `bounty_rule` shapes, `loyalty_reward`)
 * must be non-negative in both halves.
 */
export function validateRatio(ratioNumerator: bigint, ratioDenominator: bigint): void {
    if (ratioDenominator <= 0n) throw new SenderError(CraftError.RATIO_DENOMINATOR_MUST_BE_POSITIVE);
    if (ratioNumerator < 0n) throw new SenderError(CraftError.RATIO_NUMERATOR_MUST_NOT_BE_NEGATIVE);
}

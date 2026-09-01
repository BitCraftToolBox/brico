import {CraftError} from '@brico/crafts/errors';
import {type FilterField, validateFilter} from '@brico/crafts/filter';
import {SenderError} from 'spacetimedb/server';

/**
 * Parses and structurally validates a `filterJson` payload, throwing `SenderError` on anything
 * `@brico/crafts/filter`'s `validateFilter` would reject.
 */
export function requireValidFilterJson(filterJson: string, disallowedFields?: readonly FilterField[]): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(filterJson);
    } catch {
        throw new SenderError(CraftError.FILTER_INVALID_JSON);
    }
    const problems = validateFilter(parsed, 'filter', disallowedFields);
    if (problems.length > 0) {
        throw new SenderError(`${CraftError.FILTER_INVALID}:${problems.join('; ')}`);
    }
}

/**
 * compiled-filter.ts — memoizes `compileFilter` by node identity, so a filter object that is reused
 * across snapshots (a cached watch or bounty rule) is compiled once.
 */
import {type CompiledFilter, compileFilter, type FilterNode} from "@brico/crafts/filter";

const cache = new WeakMap<FilterNode, CompiledFilter>();

/** The compiled form of `node`. `node` must not be mutated after the first call. */
export function compiledFilter(node: FilterNode): CompiledFilter {
    let compiled = cache.get(node);
    if (!compiled) {
        compiled = compileFilter(node);
        cache.set(node, compiled);
    }
    return compiled;
}

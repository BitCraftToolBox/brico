/**
 * names.ts — display names for the live relay rows.
 *
 * Framework-free for the same reason as `filter.ts`: `brico-bot` renders claim names into Discord
 * embeds and payout reports, and it should reach the same string the web page shows rather than
 * re-deriving the format. No Solid, no bindings, no `~/` imports.
 */

/** Separates a template from its arguments in an unresolved game localization row. */
const ARG_SEPARATOR = "|~";

/**
 * Resolves a claim name the way the game itself would.
 *
 * Player-named claims are plain text, but the game auto-names the claims on ruins and caves with an
 * *unresolved* localization row: the template followed by its arguments, all `|~`-separated
 * (`"{0} (N: {1}, E: {2})|~Giant Skitch Dungeon|~6403|~8341"`). Just over half the claims prism
 * relays arrive in that form, so passing the string straight through would put a raw template on
 * screen.
 *
 * A placeholder with no matching argument is left as-is rather than blanked, so a format this
 * doesn't anticipate degrades to something recognizable instead of to a hole in the name.
 */
export function claimDisplayName(name: string): string {
    if (!name.includes(ARG_SEPARATOR)) return name;
    const [template, ...args] = name.split(ARG_SEPARATOR);
    return template.replace(/\{(\d+)}/g, (placeholder, index) => args[Number(index)] ?? placeholder);
}

/**
 * A region's display name, always carrying its number: `"Lumethis (R14)"`.
 *
 * Region names alone are not something most players have memorized, while the number is what
 * every out-of-game tool, map link and "which region are you on?" conversation uses. Showing both
 * costs five characters and removes the lookup. A region whose `region` row hasn't arrived yet has
 * only the number to show, so it degrades to `"Region 14"` rather than to `" (R14)"`.
 */
export function regionDisplayName(name: string | null | undefined, id: number): string {
    const trimmed = name?.trim();
    return trimmed ? `${trimmed} (R${id})` : `Region ${id}`;
}

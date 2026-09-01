/**
 * SavedFiltersDialog.tsx — the craft browser's "Saved Filters" import/export dialog.
 *
 * Import accepts three shapes in one textarea: a single `{name, filter}` export (or a bare
 * `FilterNode`), a JSON array of either (batch import — invalid entries are skipped rather than
 * failing the whole paste), or a share code minted by `createSharedFilters` (redeemed via the
 * `readSharedFilters` procedure). A file upload always goes through the JSON path — a file's
 * contents are never a bare 6-character code.
 *
 * Export lists one row per saved filter plus a synthetic "All filters" row bundling every one of
 * them; each row can be copied as JSON, downloaded as a file, or (logged in only, since a share
 * link is backed by the account-owned `saved_craft_filter` row server-side) turned into a share
 * code via `createSharedFilters`.
 */
import type {ReadSharedFiltersResult} from "@brico/bindings/brico-app/types";
import {type FilterField, type FilterNode, type FilterValue, parseFilter, validateFilter} from "@brico/crafts/filter";
import {msg, plural, t} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {
    TbOutlineClipboardCheck as IconClipboardCheck,
    TbOutlineCopy as IconCopy,
    TbOutlineDownload as IconDownload,
    TbOutlineShare as IconShare,
    TbOutlineTrash as IconRemove,
    TbOutlineUpload as IconUpload,
} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from "~/components/ui/dialog";
import {Popover, PopoverAnchor, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {TextField, TextFieldTextArea} from "~/components/ui/text-field";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {describeFilterLocalized} from "~/lib/crafts/filter-condition";
import {trackUILocale} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";
import {type CraftWatchTriggers, SavedCraftFilter, useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {cn, downloadTextFile, useCopy} from "~/lib/utils";

export type FilterExport = {name: string; filter: FilterNode};

/** The share-code alphabet's shape (see `SHARE_CODE_ALPHABET` in the module) — used only to tell a
 * pasted code apart from JSON, never to validate it; an unknown code is just rejected by the server. */
const SHARE_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/i;

/** Unwraps one import candidate — a bare `FilterNode`, or a `{name, filter}` export. */
function unwrapCandidate(raw: unknown): {node: unknown; name: string | null} {
    if (raw && typeof raw === "object" && "filter" in (raw as Record<string, unknown>)) {
        const candidate = raw as Partial<FilterExport>;
        return {node: candidate.filter, name: typeof candidate.name === "string" ? candidate.name : null};
    }
    return {node: raw, name: null};
}

/** `json`'s top-level value, treating an array as a batch of candidates and anything else as one. */
function candidatesFrom(json: unknown): {node: unknown; name: string | null}[] {
    return (Array.isArray(json) ? json : [json]).map(unwrapCandidate);
}

/** Keeps only the structurally valid candidates — a batch import skips bad entries, it doesn't fail outright. */
function validEntriesFrom(candidates: {node: unknown; name: string | null}[]): FilterExport[] {
    trackUILocale();
    const entries: FilterExport[] = [];
    candidates.forEach((candidate, index) => {
        if (validateFilter(candidate.node).length === 0) {
            const fallback = candidates.length > 1 ? t`Imported filter ${index + 1}` : t`Imported filter`;
            entries.push({name: candidate.name ?? fallback, filter: candidate.node as FilterNode});
        }
    });
    return entries;
}

/** Parses pasted/uploaded JSON text into import entries, or an error message if none were valid. */
function parseImportJson(text: string): {entries: FilterExport[]; error: string | null} {
    trackUILocale();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return {entries: [], error: t`Not valid JSON.`};
    }
    const entries = validEntriesFrom(candidatesFrom(json));
    return entries.length > 0 ? {entries, error: null} : {entries: [], error: t`No valid filters found.`};
}

/** Turns a redeemed share code's rows into import entries, dropping any that fail to parse. */
function entriesFromShared(result: ReadSharedFiltersResult): FilterExport[] {
    const entries: FilterExport[] = [];
    for (const row of result.filters) {
        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(row.filterJson);
        } catch {
            continue;
        }
        const filter = parseFilter(parsedJson);
        if (filter) entries.push({name: row.name, filter});
    }
    return entries;
}

interface ExportRow {
    key: string;
    name: string;
    filterIds: string[];
    json: string;
}

function ExportRowView(props: {row: ExportRow; canShare: boolean; onShare: (filterIds: string[]) => Promise<string>, onDelete: (key: string) => void}) {
    const {_} = useLingui();
    const [copy, copied] = useCopy(() => props.row.json);
    const [shareOpen, setShareOpen] = createSignal(false);
    const [shareCode, setShareCode] = createSignal<string | null>(null);
    const [shareError, setShareError] = createSignal<string | null>(null);
    const [shareBusy, setShareBusy] = createSignal(false);
    const [copyCode, codeCopied] = useCopy(() => shareCode() ?? "");
    const [confirmOpen, setConfirmOpen] = createSignal(false);

    const onShareOpenChange = (open: boolean) => {
        setShareOpen(open);
        if (!open || shareCode() !== null || shareBusy()) return;
        setShareBusy(true);
        setShareError(null);
        props.onShare(props.row.filterIds)
            .then(setShareCode)
            .catch((cause: unknown) => setShareError(describeServerError(cause)))
            .finally(() => setShareBusy(false));
    };

    return (
        <div class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <span class="truncate text-sm font-medium">{props.row.name}</span>
            <div class="flex shrink-0 items-center gap-1">
                <Show when={props.canShare}>
                    <Popover open={shareOpen()} onOpenChange={onShareOpenChange}>
                        <PopoverTrigger
                            as={Button<"button">} variant="ghost" size="icon" class="size-8"
                            aria-label={_(msg`Get a share link for ${props.row.name}`)} title={_(msg`Share link`)}
                        >
                            <IconShare class="size-4"/>
                        </PopoverTrigger>
                        <PopoverContent class="space-y-2 p-3 w-fit">
                            <Show when={shareBusy()}><p class="text-sm text-muted-foreground"><Trans>Generating…</Trans></p></Show>
                            <Show when={shareError()}>{message => <p class="text-sm text-error">{message()}</p>}</Show>
                            <Show when={shareCode()}>
                                {code => (
                                    <div class="flex items-center gap-2">
                                        <code class="rounded bg-muted px-2 py-1 font-mono text-sm tracking-widest">{code()}</code>
                                        <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Copy share code`)} onClick={copyCode}>
                                            <Show when={codeCopied()} fallback={<IconCopy class="size-4"/>}><IconClipboardCheck class="size-4"/></Show>
                                        </Button>
                                    </div>
                                )}
                            </Show>
                        </PopoverContent>
                    </Popover>
                </Show>
                <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Copy ${props.row.name} as JSON`)} onClick={copy}>
                    <Show when={copied()} fallback={<IconCopy class="size-4"/>}><IconClipboardCheck class="size-4"/></Show>
                </Button>
                <Button
                    variant="ghost" size="icon" class="size-8" aria-label={_(msg`Download ${props.row.name}`)}
                    onClick={() => downloadTextFile(`${props.row.name}.json`, props.row.json)}
                >
                    <IconDownload class="size-4"/>
                </Button>
                <Dialog open={confirmOpen()} onOpenChange={setConfirmOpen}>
                    <DialogTrigger
                        class="text-muted-foreground hover:text-foreground" aria-label={_(msg`Delete filter ${props.row.name}`)}
                        onClick={e => { if (e.shiftKey) props.onDelete(props.row.key); }}
                    >
                        <IconRemove class="size-3.5"/>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                <Show when={props.row.key === "__all__"} fallback={<Trans>Delete {props.row.name}?</Trans>}>
                                    <Trans>Delete all filters?</Trans>
                                </Show>
                            </DialogTitle>
                            <DialogDescription><Trans>This can't be undone. The filter will still be available via previously created share codes.</Trans></DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmOpen(false)}><Trans>Cancel</Trans></Button>
                            <Button variant="destructive" onClick={() => {setConfirmOpen(false); props.onDelete(props.row.key);}}><Trans>Delete</Trans></Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

export function SavedFiltersDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    savedFilters: SavedCraftFilter[];
    onImport: (entries: FilterExport[]) => void;
    /** Resolves an id/number to a display label for the pending-import preview's filter summaries — see `describeFilterLocalized`. */
    labelFor?: (field: FilterField, value: FilterValue) => string;
}) {
    const {_} = useLingui();
    const label = useLabel();
    const {isLoggedIn} = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);

    const {savedCraftFilters, setSavedCraftFilters, craftFilterWatches, setCraftFilterWatches} = useSettings();
    const setWatchFor = (id: string, next: CraftWatchTriggers) => {
        const {[id]: _dropped, ...rest} = craftFilterWatches();
        setCraftFilterWatches(next.added || next.finished || next.removed ? {...rest, [id]: next} : rest);
    };

    const [importText, setImportText] = createSignal("");
    const [importBusy, setImportBusy] = createSignal(false);
    const [importMessage, setImportMessage] = createSignal<{text: string; error: boolean} | null>(null);
    const [pendingImport, setPendingImport] = createSignal<FilterExport[] | null>(null);
    let fileInput: HTMLInputElement | undefined;

    // Parsing never applies an import directly — it stages the candidates behind the confirm
    // popover below (`pendingImport`) so the user can see what they're about to add first.
    const presentImport = (entries: FilterExport[], error: string | null) => {
        setImportBusy(false);
        if (entries.length === 0) {
            setImportMessage({text: error ?? _(msg`No valid filters found.`), error: true});
            return;
        }
        setPendingImport(entries);
    };

    const confirmImport = () => {
        const entries = pendingImport();
        setPendingImport(null);
        if (!entries) return;
        props.onImport(entries);
        setImportText("");
        setImportMessage({text: _(msg({message: plural(entries.length, {one: "Imported # filter.", other: "Imported # filters."})})), error: false});
    };

    const cancelImport = () => setPendingImport(null);

    const importFromFile = (text: string) => {
        const {entries, error} = parseImportJson(text);
        presentImport(entries, error);
    };

    const importFromTextarea = () => {
        const trimmed = importText().trim();
        if (!trimmed) return;
        setImportBusy(true);
        setImportMessage(null);

        let looksLikeJson = true;
        try {
            JSON.parse(trimmed);
        } catch {
            looksLikeJson = false;
        }

        if (!looksLikeJson && SHARE_CODE_PATTERN.test(trimmed)) {
            const active = conn.active();
            if (!active) {
                presentImport([], _(msg`Not connected.`));
                return;
            }
            active.procedures.readSharedFilters({code: trimmed.toUpperCase()})
                .then(result => {
                    const entries = entriesFromShared(result);
                    presentImport(entries, entries.length === 0 ? _(msg`That share code has no importable filters.`) : null);
                })
                .catch((cause: unknown) => presentImport([], describeServerError(cause)));
            return;
        }

        const {entries, error} = parseImportJson(trimmed);
        presentImport(entries, error);
    };

    const onFileChange = (e: Event) => {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        setImportBusy(true);
        setImportMessage(null);
        file.text().then(importFromFile);
    };

    const exportRows = createMemo<ExportRow[]>(() => {
        const rows = props.savedFilters.map((saved): ExportRow => ({
            key: saved.id,
            name: saved.name,
            filterIds: [saved.id],
            json: JSON.stringify({name: saved.name, filter: saved.filter} satisfies FilterExport),
        }));
        if (props.savedFilters.length > 0) {
            rows.push({
                key: "__all__",
                name: "All filters",
                filterIds: props.savedFilters.map(saved => saved.id),
                json: JSON.stringify(props.savedFilters.map((saved): FilterExport => ({name: saved.name, filter: saved.filter}))),
            });
        }
        return rows;
    });

    const NO_WATCH: CraftWatchTriggers = {added: false, finished: false, removed: false};
    const onDelete = (key: string) => {
        const savedList = key === "__all__" ? savedCraftFilters() : [savedCraftFilters().find(s => s.id === key)].filter(s => !!s);
        savedList.forEach(saved => {
            setSavedCraftFilters(savedCraftFilters().filter(other => other.id !== saved.id));
            setWatchFor(saved.id, NO_WATCH);
        });
    }

    const shareFilters = async (filterIds: string[]): Promise<string> => {
        const active = conn.active();
        if (!active) throw new Error(_(msg`Not connected.`));
        const result = await active.procedures.createSharedFilters({filterIds});
        return result.code;
    };

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent class="max-w-lg">
                <DialogHeader>
                    <DialogTitle><Trans>Saved Filters</Trans></DialogTitle>
                </DialogHeader>
                <div class="space-y-5">
                    <div class="space-y-2">
                        <h3 class="text-sm font-semibold"><Trans>Import</Trans></h3>
                        <TextField value={importText()} onChange={value => {setImportText(value); setImportMessage(null);}}>
                            <TextFieldTextArea class="h-24 font-mono text-xs" placeholder={_(msg`Paste a filter, a list of filters, or a share code`)}/>
                        </TextField>
                        <Popover open={pendingImport() !== null} onOpenChange={open => { if (!open) cancelImport(); }}>
                            <PopoverAnchor as="div" class="flex items-center gap-2">
                                <Button size="sm" disabled={!importText().trim() || importBusy()} onClick={importFromTextarea}>
                                    <Trans>Import</Trans>
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => fileInput?.click()}>
                                    <IconUpload class="mr-1 size-4"/><Trans>Upload file</Trans>
                                </Button>
                                <input ref={fileInput} type="file" accept="application/json" class="hidden" onChange={onFileChange}/>
                            </PopoverAnchor>
                            <PopoverContent class="space-y-3">
                                <p class="text-sm font-medium">
                                    <Trans>Import <Plural value={pendingImport()?.length ?? 0} one="# filter" other="# filters"/>?</Trans>
                                </p>
                                <div class="space-y-1.5 overflow-auto">
                                    <For each={pendingImport() ?? []}>
                                        {entry => (
                                            <div class="rounded-md border border-border px-2 py-1.5">
                                                <p class="truncate text-sm font-medium">{entry.name}</p>
                                                <p class="max-h-8 overflow-y-auto text-xs text-muted-foreground">{describeFilterLocalized(entry.filter, label, props.labelFor)}</p>
                                            </div>
                                        )}
                                    </For>
                                </div>
                                <div class="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={cancelImport}><Trans>Cancel</Trans></Button>
                                    <Button size="sm" onClick={confirmImport}><Trans>Import</Trans></Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Show when={importMessage()}>
                            {message => <p class={cn("text-sm", message().error ? "text-error" : "text-muted-foreground")}>{message().text}</p>}
                        </Show>
                    </div>

                    <div class="space-y-2">
                        <h3 class="text-sm font-semibold"><Trans>Export</Trans></h3>
                        <Show when={!isLoggedIn()}>
                            <p class="text-sm text-muted-foreground"><Trans>Log in to create share links.</Trans></p>
                        </Show>
                        <Show when={exportRows().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No saved filters yet.</Trans></p>}>
                            <div class="max-h-64 space-y-1.5 overflow-auto">
                                <For each={exportRows()}>
                                    {row => <ExportRowView row={row} canShare={isLoggedIn()} onShare={shareFilters} onDelete={onDelete}/>}
                                </For>
                            </div>
                        </Show>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

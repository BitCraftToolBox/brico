/**
 * LocalGroupingsManager.tsx — lets a payer group BitCraft player ids under an arbitrary display
 * name of their own, purely for local aggregation on `/account/payees` (edited from
 * `/account/settings`, not from the payees page itself — see that page's doc comment). This is a
 * secondary lookup layered on top of the brico-account grouping the backend already resolves (see
 * `applyLocalGroupings` in `~/lib/crafts/entitlement-reports`): a payee who hasn't linked or shared
 * a brico account still shows up as its own row otherwise, and not every payer wants that.
 *
 * Entirely client-side — stored in `LocalPayeeGrouping[]` (`~/lib/settings`), never touches the
 * backend. Actual payments always target one player id regardless of how this groups them for
 * display.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {TbOutlineTrash as IconRemove} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {type PlayerOption, PlayerPicker} from "~/components/crafts/PlayerPicker";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import type {LocalPayeeGrouping} from "~/lib/settings";

/** One existing grouping's editor row — edits are staged locally until Save, so a `LiveTable`-style
 * re-render of the underlying data (or a sibling row's edit) can't clobber mid-edit state. */
function GroupingRow(props: {
    grouping: LocalPayeeGrouping;
    /** This row's own selected ids plus every id not claimed by some *other* row — see
     * `LocalGroupingsManager`'s `optionsFor`. */
    availableOptions: PlayerOption[];
    onSave: (next: LocalPayeeGrouping) => void;
    onDelete: () => void;
}) {
    const {_} = useLingui();
    const [name, setName] = createSignal(props.grouping.name);
    const [playerIds, setPlayerIds] = createSignal(props.grouping.playerIds);

    const dirty = createMemo(() =>
        name().trim() !== props.grouping.name || playerIds().join(",") !== props.grouping.playerIds.join(",")
    );

    return (
        <div class="flex items-center gap-2">
            <TextField value={name()} onChange={setName} class="w-40 shrink-0">
                <TextFieldInput class="h-9" placeholder={_(msg`Group name`)}/>
            </TextField>
            <PlayerPicker options={props.availableOptions} selected={playerIds()} onChange={setPlayerIds}/>
            <Button size="sm" disabled={!dirty() || !name().trim()} onClick={() => props.onSave({name: name().trim(), playerIds: playerIds()})}>
                <Trans>Save</Trans>
            </Button>
            <Button size="sm" variant="ghost" class="shrink-0 text-muted-foreground hover:text-destructive" aria-label={_(msg`Delete grouping`)} onClick={props.onDelete}>
                <IconRemove class="size-4"/>
            </Button>
        </div>
    );
}

export function LocalGroupingsManager(props: {
    /** Player options to offer — the full known player table (see `createPlayerNames` in
     * `~/lib/crafts/relay`), not scoped to the payer's own payees: `/account/settings` has no
     * access to the payees report itself, and grouping a player who never turns out to owe
     * anything is harmless (see `applyLocalGroupings`). */
    playerOptions: PlayerOption[];
    groupings: LocalPayeeGrouping[];
    onChange: (next: LocalPayeeGrouping[]) => void;
}) {
    const {_} = useLingui();
    const [newName, setNewName] = createSignal("");
    const [newPlayerIds, setNewPlayerIds] = createSignal<string[]>([]);

    /** Player ids already claimed by some other grouping — a given id may only ever live in one
     * row. `excludeIndex` is the row being edited, whose own current picks stay selectable. */
    const optionsFor = (excludeIndex?: number) => {
        const claimed = new Set<string>();
        props.groupings.forEach((g, i) => { if (i !== excludeIndex) g.playerIds.forEach(id => claimed.add(id)); });
        return props.playerOptions.filter(o => !claimed.has(o.playerId));
    };

    const addGrouping = () => {
        const name = newName().trim();
        if (!name) return;
        props.onChange([...props.groupings, {name, playerIds: newPlayerIds()}]);
        setNewName("");
        setNewPlayerIds([]);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Local groupings</Trans></CardTitle>
                <CardDescription>
                    <Trans>
                        Group payees who haven't linked a shared account under a name of your own, just for the totals on the
                        {" "}<A href="/account/payees" class="underline hover:text-foreground">Payouts</A> page. Stored only in this browser.
                    </Trans>
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-3">
                <div class="flex items-center gap-2">
                    <TextField value={newName()} onChange={setNewName} class="w-40 shrink-0">
                        <TextFieldInput class="h-9" placeholder={_(msg`Group name`)}/>
                    </TextField>
                    <PlayerPicker options={optionsFor()} selected={newPlayerIds()} onChange={setNewPlayerIds}/>
                    <Button size="sm" disabled={!newName().trim()} onClick={addGrouping}>
                        <Trans>Add</Trans>
                    </Button>
                </div>
                <Show when={props.groupings.length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No local groupings yet.</Trans></p>}>
                    <For each={props.groupings}>
                        {(grouping, index) => (
                            <GroupingRow
                                grouping={grouping}
                                availableOptions={optionsFor(index())}
                                onSave={next => props.onChange(props.groupings.map((g, i) => i === index() ? next : g))}
                                onDelete={() => props.onChange(props.groupings.filter((_grouping, i) => i !== index()))}
                            />
                        )}
                    </For>
                </Show>
            </CardContent>
        </Card>
    );
}

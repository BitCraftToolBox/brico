/**
 * `/account/loyalty` — the manual loyalty-reward assignment page. A payer picks one of their
 * payees and gives them a payout multiplier (e.g. `1.05` for +5%), stored as an exact ratio in
 * `loyalty_reward` and folded by `brico-bot` into that payee's bounty ratio *before* the
 * entitlement floor, so it behaves like a plain percentage bonus.
 *
 * Deliberately not surfaced anywhere else in the frontend: a payee's boosted payout is only ever
 * visible in their own totals on `/account/payouts`, never as a separate "estimated" number
 * anywhere — the craft browser/detail page's estimated-payout preview never applies a multiplier.
 *
 * Similar shape to `~/components/crafts/LocalGroupingsManager` (a picker + input to add rows, plus
 * a table of existing rows with an editable field and delete button) but against real backend
 * state via `createLoyaltyRewards`, not `localStorage`.
 */
import type {LoyaltyReward} from "@brico/bindings/brico-app/types";
import {parseDecimalRatio} from "@brico/crafts/entitlement";
import {BOUNTY_CURRENCIES} from "@brico/crafts/filter";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineTrash as IconRemove} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {CurrencySelect} from "~/components/crafts/CurrencySelect.tsx";
import {type PlayerOption, PlayerPicker} from "~/components/crafts/PlayerPicker";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {createLoyaltyRewards} from "~/lib/crafts/loyalty-rewards";
import {createPlayerNames} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {compareText} from "~/lib/i18n";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";

/** A ratio as the plain decimal string a multiplier field displays — `1.05`, not `105/100`. */
function formatMultiplier(ratioNumerator: bigint, ratioDenominator: bigint): string {
    if (ratioDenominator === 0n) return "";
    return String(Number(ratioNumerator) / Number(ratioDenominator));
}

/** One existing reward's editor row — staged locally until Save, same reasoning as
 * `LocalGroupingsManager`'s `GroupingRow`: a live resubscribe of `myLoyaltyReward` can't clobber a
 * mid-edit multiplier. */
function RewardRow(props: {
    reward: LoyaltyReward;
    playerName: string;
    onSave: (ratioNumerator: bigint, ratioDenominator: bigint) => Promise<void>;
    onDelete: () => Promise<void>;
}) {
    const {_} = useLingui();
    const [text, setText] = createSignal(formatMultiplier(props.reward.ratioNumerator, props.reward.ratioDenominator));
    const [busy, setBusy] = createSignal(false);

    const parsed = createMemo(() => parseDecimalRatio(text().trim()));
    const dirty = createMemo(() => {
        const p = parsed();
        return p !== null && (p.numerator !== props.reward.ratioNumerator || p.denominator !== props.reward.ratioDenominator);
    });
    const valid = createMemo(() => {
        const p = parsed();
        return p !== null && p.numerator > 0n && p.numerator >= p.denominator;
    });

    const reportError = (title: string, cause: unknown) => {
        showToast({title: () => title, description: () => describeServerError(cause), variant: "destructive"});
    };

    const save = async () => {
        const p = parsed();
        if (!p || p.numerator <= 0n) return;
        setBusy(true);
        try {
            await props.onSave(p.numerator, p.denominator);
        } catch (cause) {
            reportError(_(msg`Could not save loyalty reward`), cause);
        } finally {
            setBusy(false);
        }
    };

    const del = async () => {
        setBusy(true);
        try {
            await props.onDelete();
        } catch (cause) {
            reportError(_(msg`Could not delete loyalty reward`), cause);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div class="flex items-center gap-2">
            <span class="w-48 shrink-0 truncate text-sm font-medium mr-auto">{props.playerName}</span>
            <CurrencyLabel currency={props.reward.currency}/>
            <TextField value={text()} onChange={setText} class="w-24">
                <TextFieldInput class="h-9" placeholder={_(msg`e.g. 1.05`)}/>
            </TextField>
            <span class="text-sm text-muted-foreground">×</span>
            <Button size="sm" disabled={!dirty() || !valid() || busy()} onClick={save}>
                <Trans>Save</Trans>
            </Button>
            <Button size="sm" variant="ghost" class="shrink-0 text-muted-foreground hover:text-destructive" aria-label={_(msg`Delete loyalty reward`)} disabled={busy()} onClick={del}>
                <IconRemove class="size-4"/>
            </Button>
        </div>
    );
}

export default function LoyaltyRewardsPage() {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const prismConn = useConnection(PRISM_SERVER);
    const bricoConn = useConnection(BRICO_APP_SERVER);
    const {names: playerNames} = createPlayerNames();
    const {rewards, upsert, remove} = createLoyaltyRewards();

    const playerOptions = createMemo<PlayerOption[]>(() =>
        [...playerNames().entries()]
            .map(([playerId, name]) => ({playerId, name}))
            .sort((a, b) => compareText(a.name, b.name))
    );
    const nameFor = (playerId: bigint) => playerNames().get(playerId.toString()) ?? playerId.toString();

    const sortedRewards = createMemo(() =>
        [...rewards()].sort((a, b) => Number(b.ratioNumerator) / Number(b.ratioDenominator) - Number(a.ratioNumerator) / Number(a.ratioDenominator))
    );

    const [newPlayerIds, setNewPlayerIds] = createSignal<string[]>([]);
    const [newCurrency, setNewCurrency] = createSignal(BOUNTY_CURRENCIES[0]);
    const [newText, setNewText] = createSignal("");
    const [adding, setAdding] = createSignal(false);

    const newParsed = createMemo(() => parseDecimalRatio(newText().trim()));
    const canAdd = createMemo(() => {
        const p = newParsed();
        return newPlayerIds().length && p !== null && p.numerator > 0 && p.numerator >= p.denominator;
    });

    const reportError = (title: string, cause: unknown) => {
        showToast({title: () => title, description: () => describeServerError(cause), variant: "destructive"});
    };

    const addReward = async () => {
        const parsed = newParsed();
        const playerId = newPlayerIds()[0];
        if (!parsed || parsed.numerator <= 0n || !playerId) return;
        setAdding(true);
        try {
            await upsert(BigInt(playerId), newCurrency(), parsed.numerator, parsed.denominator);
            setNewPlayerIds([]);
            setNewText("");
        } catch (cause) {
            reportError(_(msg`Could not add loyalty reward`), cause);
        } finally {
            setAdding(false);
        }
    };

    return (
        <MainLayout
            title={_(msg`Loyalty rewards`)}
            hideSearch
            ownHeading
            description="Give specific payees a payout multiplier on top of their bounties."
            navTitle={breadcrumb("/account", msg`Loyalty rewards`)}
        >
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Bounty payouts</Trans>}
                    tabs={bountyTabs()}
                    status={<ConnectionStatusBadge connections={[prismConn, bricoConn]}/>}
                />

                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription><Trans>Log in to assign loyalty rewards.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <Card>
                        <CardHeader>
                            <CardTitle><Trans>Loyalty rewards</Trans></CardTitle>
                            <CardDescription>
                                <Trans>
                                    A multiplier applied on top of the normal bounty math for crafts you pay out — e.g. 1.05 pays a
                                    player 5% more than their bounty alone would. Not shown anywhere except here; the payee's boosted
                                    total is only ever visible in their own payout totals.
                                </Trans>
                            </CardDescription>
                        </CardHeader>
                        <CardContent class="flex flex-col gap-3">
                            <div class="flex items-center gap-2">
                                <PlayerPicker options={playerOptions()} selected={newPlayerIds()} onChange={setNewPlayerIds} multiple={false}/>
                                <CurrencySelect value={newCurrency()} onChange={setNewCurrency}/>
                                <TextField value={newText()} onChange={setNewText} class="w-24">
                                    <TextFieldInput class="h-9" placeholder={_(msg`e.g. 1.05`)}/>
                                </TextField>
                                <span class="text-sm text-muted-foreground">×</span>
                                <Button size="sm" disabled={!canAdd() || adding()} onClick={addReward}>
                                    <Trans>Add</Trans>
                                </Button>
                            </div>

                            <Show when={sortedRewards().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No loyalty rewards yet.</Trans></p>}>
                                <div class="flex flex-col gap-2">
                                    <For each={sortedRewards()}>
                                        {reward => (
                                            <RewardRow
                                                reward={reward}
                                                playerName={nameFor(reward.payeePlayerId)}
                                                onSave={(ratioNumerator, ratioDenominator) => upsert(reward.payeePlayerId, reward.currency, ratioNumerator, ratioDenominator)}
                                                onDelete={() => remove(reward.payeePlayerId, reward.currency)}
                                            />
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </CardContent>
                    </Card>
                </Show>
            </div>
        </MainLayout>
    );
}

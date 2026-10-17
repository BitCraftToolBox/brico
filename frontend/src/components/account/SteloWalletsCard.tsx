/**
 * SteloWalletsCard.tsx — the "Stelo wallets" card on `/account/profile`: the caller's linked wallets
 * (receiving wallet per currency, whether the bot can fund from each) and the address-based link flow.
 */
import type {LinkedIntegration} from "@brico/bindings/brico-app/types";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {createEffect, createMemo, createSignal, For, on, Show} from "solid-js";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Checkbox} from "~/components/ui/checkbox";
import {Collapsible, CollapsibleContent} from "~/components/ui/collapsible";
import {RadioGroup, RadioGroupItem, RadioGroupItemLabel} from "~/components/ui/radio-group";
import {TextField, TextFieldErrorMessage, TextFieldInput, TextFieldLabel} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {type SteloWalletView, useLinkedIntegrations} from "~/lib/account/links";
import {checkSteloAddress, groupWalletsByCurrency, linkKey, linkOutcome, type PendingReasonKey, pendingReasonKey} from "~/lib/account/stelo-link-flow";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";

const STELO_PROVIDER = "stelo";

const PENDING_REASON_COPY: Record<PendingReasonKey, ReturnType<typeof msg>> = {
    "checking": msg`Checking…`,
    "bot-not-member": msg`Brico.app is not on that account (or the address is wrong). Add it under Permissions and this retries by itself.`,
    "ambiguous-address": msg`That address exists on more than one ledger. Use the account's address on the Hex Coin ledger.`,
    "not-debit": msg`That account can't be linked as a wallet: it isn't a debit account.`,
    "wrong-ledger": msg`That account can't be linked as a wallet: it isn't on a supported ledger.`,
    "escrow-account": msg`That account can't be linked as a wallet: it is Brico's own escrow account.`,
    "no-linked-bitcraft-player": msg`Link your BitCraft account above first.`,
    "no-owner-admin-match": msg`None of your linked characters is an Owner or Admin of that account on Stelo.`,
    "unknown-address": msg`No account with that address exists on a supported ledger.`,
    "confirm-unverified": msg`Found an account. Confirm it below to link it.`,
    "verified": msg`Verified. Linking…`,
    "unknown": msg`That account can't be linked yet.`,
};

function WalletRow(props: {wallet: SteloWalletView; onUnlink: (link: LinkedIntegration) => void}) {
    return (
        <div class="flex items-center justify-between gap-3">
            <RadioGroupItem value={props.wallet.link.id.toString()} class="min-w-0 flex-1">
                <RadioGroupItemLabel class="flex flex-wrap items-center gap-2">
                    <span class="font-mono">#{props.wallet.address}</span>
                    <Show
                        when={props.wallet.canPull !== undefined && props.wallet.verified !== undefined}
                        fallback={<Badge variant="outline"><Trans>Checking…</Trans></Badge>}
                    >
                        <Show
                            when={props.wallet.verified}
                            fallback={<Badge variant="secondary"><Trans>Unverified: can receive, not fund</Trans></Badge>}
                        >
                            <Show
                                when={props.wallet.canPull}
                                fallback={<Badge variant="secondary"><Trans>Read only: can receive, not fund</Trans></Badge>}
                            >
                                <Badge variant="outline"><Trans>Can fund bounties</Trans></Badge>
                            </Show>
                        </Show>
                    </Show>
                </RadioGroupItemLabel>
            </RadioGroupItem>
            <Button variant="outline" size="sm" onClick={() => props.onUnlink(props.wallet.link)}>
                <Trans>Unlink</Trans>
            </Button>
        </div>
    );
}

export function SteloWalletsCard(props: {onUnlink: (link: LinkedIntegration) => void}) {
    const {_} = useLingui();
    const {
        links, pendingRequests, steloWallets, unregisteredSteloLinks, beginLink,
        submitSteloCandidate, confirmLinkCandidate, cancelLinkRequest, setReceivingWallet,
    } = useLinkedIntegrations();

    const groups = createMemo(() => groupWalletsByCurrency(steloWallets()));
    const [open, setOpen] = createSignal(false);
    const [input, setInput] = createSignal("");
    const [submitting, setSubmitting] = createSignal(false);
    const [unverified, setUnverified] = createSignal(false);
    const check = createMemo(() => checkSteloAddress(input()));

    // The wait is whatever the module holds: a stelo request with a candidate, so it survives a reload.
    const waitingRequest = createMemo(() =>
        pendingRequests().find(r => r.provider === STELO_PROVIDER && r.externalId === undefined && r.candidateAddress !== undefined)
    );
    const isWaiting = createMemo(() => waitingRequest() !== undefined);
    const steloLinkKeys = () => new Set(links().filter(l => l.provider === STELO_PROVIDER).map(linkKey));

    let linkKeysBefore = new Set<string>();
    let alreadyLinked = false;
    let wasWaiting = false;
    createEffect(on(isWaiting, waiting => {
        const outcome = linkOutcome({wasWaiting, isWaiting: waiting, alreadyLinked, linkKeysBefore, linkKeysNow: steloLinkKeys()});
        if (waiting && !wasWaiting) {
            linkKeysBefore = steloLinkKeys();
            const candidate = waitingRequest()?.candidateAddress;
            alreadyLinked = links().some(l => l.provider === STELO_PROVIDER && l.externalHandle === candidate);
        }
        wasWaiting = waiting;
        if (outcome === "success") {
            showToast({title: () => <Trans>Wallet linked</Trans>, variant: "success"});
            setOpen(false);
            setInput("");
        } else if (outcome === "already-linked") {
            showToast({title: () => <Trans>Wallet already linked</Trans>});
            setOpen(false);
            setInput("");
        } else if (outcome === "timeout") {
            showToast({title: () => <Trans>Linking timed out, try again</Trans>, variant: "error"});
        }
    }));

    function reportError(e: unknown) {
        console.error(e);
        showToast({title: () => <Trans>Something went wrong</Trans>, description: () => describeServerError(e), variant: "error"});
    }

    async function link() {
        const address = check();
        if (address.state !== "valid") return;
        setSubmitting(true);
        let code: string | undefined;
        try {
            code = await beginLink(STELO_PROVIDER);
            await submitSteloCandidate(code, address.address, unverified());
        } catch (e) {
            reportError(e);
            if (code) await cancelLinkRequest(code).catch(() => {});
        } finally {
            setSubmitting(false);
        }
    }

    async function cancel() {
        const request = waitingRequest();
        if (!request) return;
        try {
            await cancelLinkRequest(request.code);
        } catch (e) {
            reportError(e);
        }
    }

    async function confirm() {
        const request = waitingRequest();
        if (!request) return;
        try {
            await confirmLinkCandidate(request.code);
        } catch (e) {
            reportError(e);
        }
    }

    async function paste() {
        try {
            setInput(await navigator.clipboard.readText());
        } catch (e) {
            console.error(e);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Stelo wallets</Trans></CardTitle>
                <CardDescription>
                    <Trans>Link Stelo wallets to fund craft bounties and to receive payouts and refunds.</Trans>
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
                <For each={groups()}>
                    {group => (
                        <div class="flex flex-col gap-2 rounded-md border p-3">
                            <p class="text-sm font-medium"><CurrencyLabel currency={group.currency}/></p>
                            <Show when={!group.hasReceiving}>
                                <p class="text-sm text-destructive">
                                    <Trans>Pick a receiving wallet: payouts and refunds can't be sent until you do.</Trans>
                                </p>
                            </Show>
                            <RadioGroup
                                value={group.wallets.find(w => w.isReceiving)?.link.id.toString()}
                                onChange={value => {
                                    if (value) setReceivingWallet(group.currency, BigInt(value)).catch(reportError);
                                }}
                                aria-label={_(msg`Receiving wallet`)}
                            >
                                <For each={group.wallets}>
                                    {wallet => <WalletRow wallet={wallet} onUnlink={props.onUnlink}/>}
                                </For>
                            </RadioGroup>
                            <p class="text-xs text-muted-foreground"><Trans>The selected wallet receives payouts and refunds.</Trans></p>
                        </div>
                    )}
                </For>

                <For each={unregisteredSteloLinks()}>
                    {link => (
                        <div class="flex items-center justify-between gap-3 rounded-md border p-3">
                            <p class="text-sm"><span class="font-mono">#{link.externalHandle ?? link.externalId}</span> <span class="text-muted-foreground"><Trans>Registering…</Trans></span></p>
                            <Button variant="outline" size="sm" onClick={() => props.onUnlink(link)}><Trans>Unlink</Trans></Button>
                        </div>
                    )}
                </For>

                <Show when={groups().length === 0 && unregisteredSteloLinks().length === 0}>
                    <p class="text-sm text-muted-foreground"><Trans>No wallets linked.</Trans></p>
                </Show>

                <Collapsible open={open()} onOpenChange={setOpen} class="flex flex-col gap-2 rounded-md border p-3">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium"><Trans>Link new wallet</Trans></p>
                        <Button size="sm" variant={open() ? "outline" : "default"} onClick={() => setOpen(!open())}>
                            <Show when={open()} fallback={<Trans>Link</Trans>}><Trans>Close</Trans></Show>
                        </Button>
                    </div>
                    <CollapsibleContent class="flex flex-col gap-3">
                        <ol class="list-decimal pl-5 text-sm flex flex-col gap-1.5">
                            <li>
                                <Trans>Go to your <a class="underline" href="https://stelo.finance/" target="_blank" rel="noopener noreferrer">Stelo</a> account.</Trans>
                            </li>
                            <li><Trans>(Optional) As a payer, create a separate account just for crafts to limit funds and permissions.</Trans></li>
                            <li>
                                <Trans>
                                    Open the account, then Add Permission, App, and add the app{" "}
                                    <b>Brico.app <span class="text-muted-foreground">· wiz</span></b>.
                                    Payers must grant <b>Write</b> permissions to the app. Receiving payouts only
                                    needs <b>Read</b>, or use the option below to skip verification.
                                </Trans>
                            </li>
                            <li><Trans>Copy the account address (starts with #) and paste it here.</Trans></li>
                            <li><Trans>Press Link.</Trans></li>
                        </ol>

                        <TextField validationState={check().state === "invalid" ? "invalid" : "valid"}>
                            <TextFieldLabel class="sr-only"><Trans>Stelo account address</Trans></TextFieldLabel>
                            <div class="flex gap-2">
                                <TextFieldInput
                                    class="font-mono"
                                    placeholder="#ABCDEF"
                                    value={input()}
                                    disabled={isWaiting()}
                                    onInput={e => setInput(e.currentTarget.value)}
                                />
                                <Show when={typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function"}>
                                    <Button variant="outline" disabled={isWaiting()} onClick={() => void paste()}><Trans>Paste</Trans></Button>
                                </Show>
                            </div>
                            <TextFieldErrorMessage><Trans>Enter the account address, like #ABCDEF.</Trans></TextFieldErrorMessage>
                        </TextField>

                        <Checkbox
                            checked={unverified()}
                            disabled={isWaiting()}
                            onChange={(checked: boolean) => setUnverified(checked)}
                            label={<Trans>Link without verifying. Skips read access and ownership checks from the app, but can only be used for receiving payouts.</Trans>}
                        />

                        <div class="flex items-center gap-2">
                            <Button disabled={isWaiting() || submitting() || check().state !== "valid"} onClick={() => void link()}>
                                <Trans>Link</Trans>
                            </Button>
                            <Show when={isWaiting()}>
                                <Button variant="outline" onClick={() => void cancel()}><Trans>Cancel</Trans></Button>
                            </Show>
                        </div>
                        <Show when={waitingRequest()}>
                            {request => (
                                <Show
                                    when={request().pendingReason === "confirm-unverified" && !request().confirmed}
                                    fallback={<p class="text-sm text-muted-foreground">{_(PENDING_REASON_COPY[pendingReasonKey(request().pendingReason)])}</p>}
                                >
                                    <div class="flex flex-col gap-2 rounded-md border p-3 text-sm">
                                        <p>
                                            <Show when={request().matchedUsername}
                                                  fallback={<Trans>Found <span class="font-mono">#{request().candidateAddress}.</span></Trans>}
                                            >
                                                {name => <Trans>Found <span class="font-mono">#{request().candidateAddress}</span> owned by <b>@{name()}</b>.</Trans>}
                                            </Show>
                                            <Trans>
                                                Payouts will be sent to this account without verifying you own it.
                                            </Trans>
                                        </p>
                                        <div>
                                            <Button onClick={() => void confirm()}><Trans>Confirm and link</Trans></Button>
                                        </div>
                                    </div>
                                </Show>
                            )}
                        </Show>
                    </CollapsibleContent>
                </Collapsible>
            </CardContent>
        </Card>
    );
}

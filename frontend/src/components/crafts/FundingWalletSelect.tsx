import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createEffect, createMemo, Show, untrack} from "solid-js";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select.tsx";
import {type SteloWalletView, useLinkedIntegrations} from "~/lib/account/links";
import {fundingWalletState, isEscrowCurrency, walletForCurrency} from "~/lib/crafts/funding-wallet";

function WalletName(props: {wallet: SteloWalletView}) {
    return (
        <span class="flex items-center gap-2">
            <span>#{props.wallet.address}</span>
            <Show when={props.wallet.isReceiving}><span class="text-xs text-muted-foreground"><Trans>receiving</Trans></span></Show>
            <Show when={props.wallet.canPull === false}><span class="text-xs text-amber-500"><Trans>read only</Trans></span></Show>
        </span>
    );
}

/**
 * Picks which of the caller's Stelo wallets funds a bounty. Renders nothing for a currency without
 * escrow. A single wallet is pre-selected; several are never guessed. The module validates the choice.
 */
export function FundingWalletSelect(props: {currency: string; value: bigint | null; onChange: (value: bigint | null) => void}) {
    const links = useLinkedIntegrations();
    const allWallets = createMemo(() => links.steloWalletsFor(props.currency));
    // Only a wallet the bot verified the caller administers can fund; the current choice stays listed so it can be replaced.
    const wallets = createMemo(() => allWallets().filter(wallet => wallet.verified === true || wallet.link.id === props.value));
    const choices = (list: readonly SteloWalletView[]) => list.map(wallet => ({linkId: wallet.link.id, currency: wallet.currency}));
    const state = createMemo(() => fundingWalletState(props.currency, props.value, choices(allWallets())));
    const selected = createMemo(() => wallets().find(wallet => wallet.link.id === props.value));
    const excluded = createMemo(() => allWallets().filter(wallet => wallet.verified !== true && wallet.link.id !== props.value).length);

    // The pre-selected wallet as a string, so the effect reruns only when it changes.
    const autoPick = createMemo(() => {
        if (!links.walletsReady() || props.value !== null) return "";
        return walletForCurrency(props.currency, null, choices(allWallets().filter(wallet => wallet.verified === true)))?.toString() ?? "";
    });
    createEffect(() => {
        const pick = autoPick();
        // Untracked: the caller's onChange reads and writes its own draft, which would otherwise re-run this effect.
        if (pick !== "") untrack(() => props.onChange(BigInt(pick)));
    });

    return (
        <Show when={isEscrowCurrency(props.currency)}>
            <Show
                when={wallets().length > 0 || state() === "invalid"}
                fallback={
                    <span class="text-sm text-muted-foreground">
                        <Show
                            when={excluded() === 0}
                            fallback={<Trans>None of your wallets are verified to fund bounties yet. Link one with Brico.app on it, on the <A href="/account/profile" class="underline hover:text-foreground">profile page</A>.</Trans>}
                        >
                            <Trans><A href="/account/profile" class="underline hover:text-foreground">Link a Stelo wallet</A> first.</Trans>
                        </Show>
                    </span>
                }
            >
                <div class="flex flex-col gap-1">
                    <Select<SteloWalletView>
                        value={selected()}
                        options={wallets()}
                        optionValue={wallet => wallet.link.id.toString()}
                        optionTextValue={wallet => `#${wallet.address}`}
                        onChange={wallet => wallet && wallet.link.id !== props.value && props.onChange(wallet.link.id)}
                        placeholder={<Trans>Funding wallet</Trans>}
                        itemComponent={itemProps => <SelectItem item={itemProps.item}><WalletName wallet={itemProps.item.rawValue}/></SelectItem>}
                    >
                        <SelectTrigger class="h-9 w-48" classList={{"border-destructive": state() === "invalid"}}>
                            <SelectValue<SteloWalletView>>
                                {current => (
                                    <Show when={state() !== "invalid"} fallback={<Trans>Unlinked wallet</Trans>}>
                                        <WalletName wallet={current.selectedOption()}/>
                                    </Show>
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent/>
                    </Select>
                    <Show when={state() === "invalid"}>
                        <span class="text-xs text-destructive"><Trans>This wallet is no longer linked. Choose another.</Trans></span>
                    </Show>
                    <Show when={selected()?.verified === false}>
                        <span class="text-xs text-destructive">
                            <Trans>This wallet is no longer verified: the account that linked it must be an Admin or Owner of it on Stelo.</Trans>
                        </span>
                    </Show>
                    <Show when={selected()?.verified !== false && selected()?.canPull === false}>
                        <span class="text-xs text-amber-500">
                            <Trans>Brico.app needs Write access on this wallet before it can fund the bounty.</Trans>
                        </span>
                    </Show>
                </div>
            </Show>
        </Show>
    );
}

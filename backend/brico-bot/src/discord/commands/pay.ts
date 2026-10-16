/**
 * pay.ts — `/pay record` (log a manual payment to a player on the payer's ledger) and `/pay stelo`
 * (send escrowed-currency funds from one of the payer's linked wallets to any wallet). Both resolve
 * their arguments, ask for confirmation with Confirm/Cancel buttons, and act only on Confirm.
 * The button `custom_id` carries the resolved arguments, which the click re-validates.
 */
import {CURRENCY_LABELS, ESCROWED_BOUNTY_CURRENCIES, MANUALLY_RECORDED_BOUNTY_CURRENCIES} from "@brico/crafts/currencies";
import {
    type APIActionRowComponent,
    type APIApplicationCommandAutocompleteInteraction,
    type APIApplicationCommandOptionChoice,
    type APIButtonComponent,
    type APIChatInputApplicationCommandInteraction,
    type APIMessageComponentInteraction,
    ApplicationCommandOptionType,
    ButtonStyle,
    ComponentType,
} from "discord-api-types/v10";

import type {Logger} from "../../log.ts";
import {timeReducerCall} from "../../metrics.ts";
import {walletLabel} from "../../stelo/direct.ts";
import {discordUserIdFor, isCommandReply, requireInteractionContext, requireLinkedAccount, resolveAccountIdentity} from "./context.ts";
import {focusedOptionName, integerOption, leafOptions, stringOption} from "./options.ts";
import type {AutocompleteHandler, CommandDeps, CommandHandler, CommandReply, ComponentHandler, LeafCommand} from "./registry.ts";

const RECORD_PREFIX = "pay_record";
const STELO_PREFIX = "pay_stelo";
const CONFIRM = "ok";
const CANCEL = "cancel";

/** Discord's cap on `choices` for one option. */
const MAX_CHOICES = 25;
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

function currencyChoices(currencies: readonly string[]): APIApplicationCommandOptionChoice<string>[] {
    return currencies.slice(0, MAX_CHOICES).map(id => ({name: CURRENCY_LABELS[id] ?? id, value: id}));
}

/** Warns when a currency list no longer fits in a fixed `choices` list; the overflow is not offered until the option moves to autocomplete. */
export function warnOnCurrencyChoiceOverflow(log: Logger): void {
    for (const [command, currencies] of [["pay record", MANUALLY_RECORDED_BOUNTY_CURRENCIES], ["pay stelo", ESCROWED_BOUNTY_CURRENCIES]] as const) {
        if (currencies.length > MAX_CHOICES) {
            log.warn("currency list exceeds Discord's choice limit; extra currencies are not offered", {command, currencies: currencies.length, limit: MAX_CHOICES});
        }
    }
}

const currencyLabel = (currency: string) => CURRENCY_LABELS[currency] ?? currency;
const formatAmount = (amount: bigint) => amount.toLocaleString("en-US");

function confirmRow(prefix: string, payload: string): APIActionRowComponent<APIButtonComponent>[] {
    return [{
        type: ComponentType.ActionRow,
        components: [
            {type: ComponentType.Button, style: ButtonStyle.Success, label: "Confirm", custom_id: `${prefix}:${CONFIRM}:${payload}`},
            {type: ComponentType.Button, style: ButtonStyle.Secondary, label: "Cancel", custom_id: `${prefix}:${CANCEL}`},
        ],
    }];
}

const parseId = (value: string): bigint | null => /^\d{1,20}$/.test(value) ? BigInt(value) : null;
/** The amount option as whole units; `null` if absent or zero (or negative, unless `allowNegative`). */
function amountOption(interaction: APIChatInputApplicationCommandInteraction, allowNegative = false): bigint | null {
    const value = integerOption(leafOptions(interaction), "amount");
    return value !== undefined && Number.isSafeInteger(value) && value !== 0 && (allowNegative || value > 0) ? BigInt(value) : null;
}

// ── /pay record ──────────────────────────────────────────────

interface PlayerRef {
    id: bigint;
    name: string;
}

/** A player id (digits) or exact name (case-insensitive) typed into the `player` option. */
function resolvePlayer(input: string, players: ReadonlyMap<bigint, {name: string}>): PlayerRef | string {
    const typed = input.trim();
    const id = parseId(typed);
    if (id !== null) {
        const player = players.get(id);
        return player ? {id, name: player.name} : `No player with id ${typed} was found.`;
    }
    const wanted = typed.toLowerCase();
    for (const [playerId, player] of players) {
        if (player.name.toLowerCase() === wanted) return {id: playerId, name: player.name};
    }
    return `No player named "${typed}" was found — pick one from the suggestions or enter a player id.`;
}

/** Players the account has an entitlement total with (optionally in one currency), as ids. */
function payeeIds(deps: CommandDeps, payer: {toHexString(): string}, currency: string | undefined): Set<bigint> {
    const {entitlementTotals, totalKeysByPayer} = deps.appCache.state;
    const ids = new Set<bigint>();
    for (const key of totalKeysByPayer.get(payer.toHexString()) ?? []) {
        const total = entitlementTotals.get(key);
        if (total && (currency === undefined || total.currency === currency)) ids.add(total.payeePlayerId);
    }
    return ids;
}

const playerChoice = (id: bigint, name: string) => ({name: `${name} (${id})`.slice(0, 100), value: id.toString()});

const recordPlayerAutocomplete: AutocompleteHandler = async (interaction: APIApplicationCommandAutocompleteInteraction, deps: CommandDeps) => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return [{name: "brico is temporarily unavailable — try again in a moment.", value: "unavailable"}];
    const account = resolveAccountIdentity(ctx.conn, discordUserIdFor(ctx));
    if (account === null) return [{name: "Link your brico account first — run /link", value: "unlinked"}];

    const options = leafOptions(interaction);
    if (focusedOptionName(options) !== "player") return [];
    const typed = (stringOption(options, "player") ?? "").trim().toLowerCase();
    const players = deps.players();

    const choices: {name: string; value: string}[] = [];
    const seen = new Set<bigint>();
    const add = (id: bigint, name: string) => {
        if (choices.length >= MAX_CHOICES || seen.has(id)) return;
        seen.add(id);
        choices.push(playerChoice(id, name));
    };

    // Players this payer already has a ledger with come first.
    for (const id of payeeIds(deps, account, stringOption(options, "currency"))) {
        const name = players.get(id)?.name;
        if (name !== undefined && (typed === "" || name.toLowerCase().includes(typed) || id.toString().startsWith(typed))) add(id, name);
    }
    if (typed === "" || choices.length >= MAX_CHOICES) return choices;

    const exactId = parseId(typed);
    const exact = exactId === null ? undefined : players.get(exactId);
    if (exactId !== null && exact) add(exactId, exact.name);

    // Name matches: prefix matches rank above substring matches.
    const substring: [bigint, string][] = [];
    for (const [id, player] of players) {
        const name = player.name.toLowerCase();
        if (name.startsWith(typed)) add(id, player.name);
        else if (substring.length < MAX_CHOICES && name.includes(typed)) substring.push([id, player.name]);
        if (choices.length >= MAX_CHOICES) return choices;
    }
    for (const [id, name] of substring) add(id, name);
    return choices;
};

const handleRecord: CommandHandler = async (interaction, deps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const account = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(account)) return account;

    const options = leafOptions(interaction);
    const currency = stringOption(options, "currency");
    if (currency === undefined || !MANUALLY_RECORDED_BOUNTY_CURRENCIES.includes(currency)) return {content: "That currency can't be recorded manually."};
    const amount = amountOption(interaction, true);
    if (amount === null) return {content: "The amount must be a non-zero whole number."};
    const player = resolvePlayer(stringOption(options, "player") ?? "", deps.players());
    if (typeof player === "string") return {content: player};

    return {
        content: `Record payment of ${formatAmount(amount)} ${currencyLabel(currency)} to ${player.name} (${player.id})?`,
        components: confirmRow(RECORD_PREFIX, `${currency}:${player.id}:${amount}`),
    };
};

const handleRecordComponent: ComponentHandler = async (interaction: APIMessageComponentInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const [, action, currency, playerId, amountText] = interaction.data.custom_id.split(":");
    if (action === CANCEL) return {content: "Cancelled."};

    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const account = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(account)) return account;

    const id = parseId(playerId ?? "");
    const amount = /^-?\d{1,16}$/.test(amountText ?? "") ? BigInt(amountText as string) : null;
    const player = id === null ? undefined : deps.players().get(id);
    if (action !== CONFIRM || currency === undefined || !MANUALLY_RECORDED_BOUNTY_CURRENCIES.includes(currency) || id === null || amount === null || amount === 0n || !player) {
        return {content: "That confirmation is no longer valid — run `/pay record` again."};
    }

    try {
        await timeReducerCall("record_bounty_payment_for", ctx.conn.reducers.recordBountyPaymentFor({
            payerAccountIdentity: account,
            payeePlayerId: id,
            currency,
            delta: amount,
        }));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("record_bounty_payment_for failed", {error: message});
        return {content: `Couldn't record the payment: ${message}`};
    }
    return {content: `Recorded payment of ${formatAmount(amount)} ${currencyLabel(currency)} to ${player.name} (${id}).`};
};

export const payRecordCommand: LeafCommand = {
    path: ["pay", "record"],
    description: "Record a manual payment you made to a player.",
    options: [
        {
            type: ApplicationCommandOptionType.String,
            name: "currency",
            description: "The currency you paid in.",
            required: true,
            choices: currencyChoices(MANUALLY_RECORDED_BOUNTY_CURRENCIES),
        },
        {
            type: ApplicationCommandOptionType.String,
            name: "player",
            description: "Who you paid: a player name or id.",
            required: true,
            autocomplete: true,
        },
        {
            type: ApplicationCommandOptionType.Integer,
            name: "amount",
            description: "How much you paid; negative records money received.",
            required: true,
            min_value: -MAX_AMOUNT,
            max_value: MAX_AMOUNT,
        },
    ],
    handler: handleRecord,
    autocomplete: recordPlayerAutocomplete,
    componentPrefix: RECORD_PREFIX,
    componentHandler: handleRecordComponent,
};

// ── /pay stelo ───────────────────────────────────────────────

/** Prefix of an autocomplete `to` value that already names a wallet by its internal id. */
const PICKED_PREFIX = "id:";

const steloWalletAutocomplete: AutocompleteHandler = async (interaction: APIApplicationCommandAutocompleteInteraction, deps: CommandDeps) => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return [{name: "brico is temporarily unavailable — try again in a moment.", value: "unavailable"}];
    const account = resolveAccountIdentity(ctx.conn, discordUserIdFor(ctx));
    if (account === null) return [{name: "Link your brico account first — run /link", value: "unlinked"}];

    const options = leafOptions(interaction);
    const focused = focusedOptionName(options);
    if (focused !== "from" && focused !== "to") return [];
    const currency = stringOption(options, "currency");
    if (currency === undefined) return [{name: "Pick a currency first", value: "no-currency"}];

    if (focused === "to") {
        try {
            const hits = await deps.directTransfers?.searchWallets(currency, stringOption(options, "to") ?? "") ?? [];
            return hits.slice(0, MAX_CHOICES).map(hit => ({name: walletLabel(hit).slice(0, 100), value: `${PICKED_PREFIX}${hit.accountId}`}));
        } catch (cause) {
            deps.log.warn("stelo wallet search failed", {error: cause instanceof Error ? cause.message : String(cause)});
            return [];
        }
    }

    const typed = (stringOption(options, "from") ?? "").trim().toLowerCase();
    return (deps.directTransfers?.sendableWallets(account, currency) ?? [])
        .filter(wallet => (wallet.address.startsWith('#') ? wallet.address.slice(1) : wallet.address).toLowerCase().includes(typed))
        .slice(0, MAX_CHOICES)
        .map(wallet => ({name: `#${wallet.address}`.slice(0, 100), value: wallet.accountId.toString()}));
};

const handleSteloPay: CommandHandler = async (interaction, deps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const account = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(account)) return account;
    if (!deps.directTransfers) return {content: "Stelo transfers aren't available right now."};

    const options = leafOptions(interaction);
    const currency = stringOption(options, "currency");
    if (currency === undefined || !ESCROWED_BOUNTY_CURRENCIES.includes(currency)) return {content: "That currency can't be sent through Stelo."};
    const amount = amountOption(interaction);
    if (amount === null) return {content: "The amount must be a positive whole number."};
    const from = parseId((stringOption(options, "from") ?? "").trim());
    if (from === null) return {content: "Pick the wallet to send from out of the suggestions."};
    const toText = (stringOption(options, "to") ?? "").trim();
    let to: bigint;
    if (toText.startsWith(PICKED_PREFIX) && parseId(toText.slice(PICKED_PREFIX.length)) !== null) {
        to = BigInt(toText.slice(PICKED_PREFIX.length));
    } else {
        const resolved = await deps.directTransfers.resolveWallet(currency, toText);
        if (!resolved.ok) return {content: resolved.reason};
        to = resolved.accountId;
    }

    const prepared = await deps.directTransfers.prepare({payer: account, currency, fromAccountId: from, toAccountId: to, amount});
    if (!prepared.ok) return {content: prepared.reason};
    const {plan} = prepared;
    return {
        content: `Transfer ${formatAmount(amount)} ${currencyLabel(currency)} from ${walletLabel(plan.from)} to ${walletLabel(plan.to)}?`,
        components: confirmRow(STELO_PREFIX, `${currency}:${from}:${to}:${amount}`),
    };
};

const handleSteloComponent: ComponentHandler = async (interaction: APIMessageComponentInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const [, action, currency, fromText, toText, amountText] = interaction.data.custom_id.split(":");
    if (action === CANCEL) return {content: "Cancelled."};

    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const account = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(account)) return account;
    if (!deps.directTransfers) return {content: "Stelo transfers aren't available right now."};

    const from = parseId(fromText ?? "");
    const to = parseId(toText ?? "");
    const amount = parseId(amountText ?? "");
    if (action !== CONFIRM || currency === undefined || from === null || to === null || amount === null) {
        return {content: "That confirmation is no longer valid — run `/pay stelo` again."};
    }

    // The books may have moved since the prompt, so the transfer is checked again before it is recorded.
    const prepared = await deps.directTransfers.prepare({payer: account, currency, fromAccountId: from, toAccountId: to, amount});
    if (!prepared.ok) return {content: prepared.reason};
    const {plan} = prepared;

    try {
        await deps.directTransfers.submit(plan);
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("direct stelo transfer intent failed", {error: message});
        return {content: `Couldn't start the transfer: ${message}`};
    }
    return {
        content: `Sending ${formatAmount(amount)} ${currencyLabel(currency)} from ${walletLabel(plan.from)} to ${walletLabel(plan.to)}. It should arrive within a minute.`,
    };
};

export const paySteloCommand: LeafCommand = {
    path: ["pay", "stelo"],
    description: "Send Stelo currency from one of your linked wallets to any wallet.",
    options: [
        {
            type: ApplicationCommandOptionType.String,
            name: "currency",
            description: "The currency to send.",
            required: true,
            choices: currencyChoices(ESCROWED_BOUNTY_CURRENCIES),
        },
        {
            type: ApplicationCommandOptionType.String,
            name: "from",
            description: "Your linked wallet to send from.",
            required: true,
            autocomplete: true,
        },
        {
            type: ApplicationCommandOptionType.String,
            name: "to",
            description: "Destination: @user, #address, or any search text.",
            required: true,
            autocomplete: true,
        },
        {
            type: ApplicationCommandOptionType.Integer,
            name: "amount",
            description: "How much to send.",
            required: true,
            min_value: 1,
            max_value: MAX_AMOUNT,
        },
    ],
    handler: handleSteloPay,
    autocomplete: steloWalletAutocomplete,
    componentPrefix: STELO_PREFIX,
    componentHandler: handleSteloComponent,
};

/**
 * memo.ts — the Stelo memo of a transfer: the intent's `ref`, then `|` and a short human-readable note.
 *
 * Stelo caps a memo at 64 bytes and replays an idempotency key only for a byte-identical memo, so
 * the memo must be a pure function of the intent and whatever names it reads. The first 32 bytes
 * hold `<ref>|<what it is for>`; a payer's own note, when there is one, follows after a second `|`.
 */
import type {SteloTransfer} from "@brico/bindings/brico-app/types";

const MAX_MEMO_BYTES = 64;
/** `<ref>|<what it is for>` is cut to this; with a payer note it is one byte shorter to leave room for the second `|`. */
const BASE_BYTES = 32;
const SEPARATOR = "|";
/** Craft ids are long; their trailing digits are the distinguishing ones. */
const CRAFT_DIGITS = 5;

/** The `ref` a memo carries: everything before the first `|`, or the whole memo when it has no note. */
export function refOfMemo(memo: string): string {
    const end = memo.indexOf(SEPARATOR);
    return end < 0 ? memo : memo.slice(0, end);
}

/** `text` cut to `maxBytes` of UTF-8 on a character boundary. */
function cut(text: string, maxBytes: number): string {
    const characters = Array.from(text);
    while (Buffer.byteLength(characters.join("")) > maxBytes) characters.pop();
    return characters.join("").trimEnd();
}

/** `<ref>|<note>` cut to 32 bytes, then `|<payerNote>`; just `ref` when there is no note. */
export function composeMemo(ref: string, note: string | undefined, payerNote?: string): string {
    const text = note?.trim();
    const base = text ? cut(`${ref}${SEPARATOR}${text}`, payerNote ? BASE_BYTES - 1 : BASE_BYTES) : ref;
    return payerNote ? cut(`${base}${SEPARATOR}${payerNote}`, MAX_MEMO_BYTES) : base;
}

const craftTail = (craftId: bigint) => craftId.toString().slice(-CRAFT_DIGITS);

/** What the transfer is for, in a few words; `payerName` is the paying brico account's name, if known. */
export function memoNote(intent: SteloTransfer, payerName: string | undefined): string {
    const from = payerName ? ` from ${payerName}` : "";
    switch (intent.purpose.tag) {
        case "Hold": return `hold for craft ${craftTail(intent.purpose.value.craftId)}`;
        case "TopUp": return `top-up craft ${craftTail(intent.purpose.value.craftId)}`;
        case "Payout": return `payout${from}`;
        case "Refund": return "escrow refund";
        case "Extras": return "loyalty extras";
        case "Direct":
        case "DirectNote": return `direct pay${from}`;
    }
}

/** The whole memo for an intent. */
export function buildMemo(intent: SteloTransfer, payerName: string | undefined): string {
    const payerNote = intent.purpose.tag === "DirectNote" ? intent.purpose.value.note : undefined;
    return composeMemo(intent.ref, memoNote(intent, payerName), payerNote);
}

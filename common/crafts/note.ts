/** Short free-text notes attached to payments: the trim, control-character and UTF-8 length rules. */

/** Longest note a payer may attach to a recorded payout, in UTF-8 bytes. */
export const PAYOUT_NOTE_MAX_BYTES = 32;

/** The note trimmed, or `null` if it is empty, longer than `maxBytes` in UTF-8, or has control characters. */
export function normalizeNote(input: string, maxBytes: number): string | null {
    const note = input.trim();
    if (note === "" || /[\u0000-\u001f\u007f]/.test(note)) return null;
    return new TextEncoder().encode(note).length <= maxBytes ? note : null;
}

/** `normalizeNote` at `PAYOUT_NOTE_MAX_BYTES`. */
export function normalizePayoutNote(input: string): string | null {
    return normalizeNote(input, PAYOUT_NOTE_MAX_BYTES);
}

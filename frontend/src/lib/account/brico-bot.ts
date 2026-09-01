/**
 * brico-bot.ts — where the browser navigates for out-of-band link verification (BitAuth's OIDC
 * flow, Discord's OAuth handshake). See `backend/brico-bot/src/http-server.ts` for what's behind
 * these URLs. This is a real page navigation (`window.location.href = ...`), not a fetch — the
 * provider's own login page has to render in the browser.
 */
const BASE_URL = (import.meta.env.VITE_BRICO_BOT_URL as string | undefined) ?? "https://bot.brico.app";

function loginUrl(provider: "bitauth" | "discord", linkCode: string): string {
    const returnUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({linkCode, returnUrl});
    return `${BASE_URL}/auth/${provider}/login?${params.toString()}`;
}

export const bitAuthLoginUrl = (linkCode: string): string => loginUrl("bitauth", linkCode);
export const discordLoginUrl = (linkCode: string): string => loginUrl("discord", linkCode);

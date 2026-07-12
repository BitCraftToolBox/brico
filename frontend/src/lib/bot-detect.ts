/**
 * Shared bot/crawler user-agent detection, used identically on both sides of the SSR split:
 * the server reads `request.headers.get("user-agent")`, the client reads `navigator.userAgent`.
 *
 * `bot|crawl|spider` alone already covers Googlebot, Bingbot, DuckDuckBot, Baiduspider,
 * YandexBot, AhrefsBot, SemrushBot, MJ12bot, Discordbot, Telegrambot, Slackbot, Twitterbot,
 * LinkedInBot, Applebot, redditbot, AdsBot-Google, Storebot-Google, etc. The extra alternatives
 * cover notable UAs that don't contain those substrings (facebookexternalhit, WhatsApp,
 * Pinterest, SkypeUriPreview and other link-preview bots, GoogleOther/Google-InspectionTool/
 * Mediapartners-Google).
 */
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora|outbrain|whatsapp|flipboard|tumblr|vkshare|w3c_validator|nuzzel|bitlybot|pinterest|skypeuripreview|mediapartners|google-inspectiontool|googleother/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
    return !!ua && BOT_UA_PATTERN.test(ua);
}

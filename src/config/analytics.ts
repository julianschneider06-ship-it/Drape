// Visitor analytics settings. The user agent is only matched in the browser, never stored or sent.
/** Words that mark a bot / crawler / headless browser in navigator.userAgent (case-insensitive). */
export const BOT_UA_WORDS = [
  "bot", "crawl", "spider", "slurp", "headless", "lighthouse", "prerender", "preview",
  "facebookexternalhit", "whatsapp", "telegram", "curl", "python", "wget",
] as const;

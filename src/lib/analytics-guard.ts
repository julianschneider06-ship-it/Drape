import { BOT_UA_WORDS } from "@/config/analytics";

const BOT_RE = new RegExp(BOT_UA_WORDS.join("|"), "i");

/** true when the user agent looks like a bot, crawler, link preview or headless browser */
export const isBotUserAgent = (ua: string | null | undefined): boolean => !!ua && BOT_RE.test(ua);

/** false for automation (navigator.webdriver) and bot user agents: no events, no device id, no Vercel Analytics */
export function trackingAllowed(nav: { webdriver?: boolean; userAgent?: string } | null | undefined): boolean {
  if (!nav) return false;
  return !nav.webdriver && !isBotUserAgent(nav.userAgent);
}

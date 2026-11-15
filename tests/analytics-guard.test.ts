import { test } from "node:test";
import assert from "node:assert/strict";
import { isBotUserAgent, trackingAllowed } from "../src/lib/analytics-guard";

const real = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];
const bots = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) Chrome-Lighthouse",
  "facebookexternalhit/1.1", "WhatsApp/2.23", "TelegramBot (like TwitterBot)", "curl/8.4.0", "python-requests/2.31", "Wget/1.21",
  "Mozilla/5.0 (compatible; Yahoo! Slurp)", "Mozilla/5.0 (compatible; bingbot/2.0)", "SomeSpider/1.0", "Prerender (+https://github.com/prerender)", "Link Preview Fetcher",
];

test("normal browsers are not bots", () => { for (const ua of real) assert.equal(isBotUserAgent(ua), false, ua); });
test("bots, crawlers and headless agents match", () => { for (const ua of bots) assert.equal(isBotUserAgent(ua), true, ua); });
test("empty user agent is not a bot match", () => { assert.equal(isBotUserAgent(""), false); assert.equal(isBotUserAgent(undefined), false); });
test("trackingAllowed: webdriver and bots are blocked, real browsers pass", () => {
  assert.equal(trackingAllowed({ webdriver: false, userAgent: real[0] }), true);
  assert.equal(trackingAllowed({ webdriver: true, userAgent: real[2] }), false);
  assert.equal(trackingAllowed({ webdriver: false, userAgent: bots[0] }), false);
  assert.equal(trackingAllowed(null), false);
});

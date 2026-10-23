// Picks products of selected brands from the Awin brands feed. Usage: npx tsx scripts/awin-select.ts <out-dir> [feed.csv.gz]
// Without a file argument the feed is downloaded from env AWIN_FEED_URL_BRANDS (trimmed; never printed or stored) into <out-dir>. <out-dir> must be OUTSIDE the repo.
// Writes selection.json (read by the awin adapter via AWIN_SELECTION_FILE) and links.json (aw_deep_link + feed snapshot, for scripts/awin-links.ts). No database access, no AI.
import { createReadStream, createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inferCategory, inferGender, normKey } from "../src/ingest/rules";
import type { AwinItem } from "../src/ingest/adapters/awin";

// Brand groups (case-insensitive variants merged) with their caps and the one merchant each is taken from (clothing shops only: watch shops, perfume and
// the Fashiontamers / Aussui rows are left out: no usable images, mixed currencies). Brian James lists every product twice (EUR + GBP): GBP rows only.
const GROUPS: { name: string; brands: string[]; cap: number; merchant: string; currency: string; shoes?: boolean }[] = [
  { name: "Tommy", brands: ["tommy hilfiger", "tommy jeans"], cap: 400, merchant: "Brian James", currency: "GBP" },
  { name: "Boss", brands: ["boss", "hugo boss"], cap: 300, merchant: "Brian James", currency: "GBP" },
  { name: "Bugatti", brands: ["bugatti"], cap: 250, merchant: "Brian James", currency: "GBP" },
  { name: "Helly Hansen", brands: ["helly hansen"], cap: 31, merchant: "Brian James", currency: "GBP" },
  { name: "Dickies", brands: ["dickies"], cap: 98, merchant: "Tooled Up", currency: "GBP" },
  // Bennimarceau (sneaker shop): Nike + adidas footwear only, one product per page (a page = one colourway, sizes are separate rows), no cap in practice. Kids' items are dropped.
  { name: "Bennimarceau", brands: ["nike", "adidas"], cap: 5000, merchant: "Bennimarceau.com", currency: "GBP", shoes: true },
];
const FOOTWEAR = new Set(["trainers", "boots", "sandals", "slippers"]);   // merchant_category values of the shoe rows
const ONLY = (process.env.AWIN_GROUPS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);   // optional: limit to these group names
const MAX_COLOURS = 2;                                     // colours of one product (same brand + name)
const NOT_WANTED = /\b(socks?|underwear|boxers?|briefs?|trunks?|3 pack|2 pack|gift|perfume|fragrance|watch(?:es)?|trainers?|sneakers?|shoes?|boots?|loafers?|slippers?|sandals?|flip flops?|overalls?|coveralls?|hi[- ]?vis[a-z]*)\b/i;
const SIZE = /^(?:[2-5]?X{0,2}[SL]|M|XXS|XS|XXL|XXXL|ONE SIZE|OS|\d{1,3}(?:[\/.]\d{1,3})?(?:\s?(?:cm|in|"|r|s|l))?|\d{1,2}-\d{1,2}|\d+\s?(?:to|-)\s?\d+)$/i;

function parseLine(s: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out;
}
async function load(path: string, keep: (r: Record<string, string>) => boolean): Promise<Record<string, string>[]> {
  const gz = createReadStream(path).pipe(createGunzip()); gz.setEncoding("utf8");
  let buf = "", rec = "", header: string[] | null = null; const rows: Record<string, string>[] = [];
  const take = (line: string) => { rec = rec ? rec + "\n" + line : line; if ((rec.match(/"/g)?.length ?? 0) % 2) return; const f = parseLine(rec); rec = "";
    if (!header) header = f; else { const o: Record<string, string> = {}; header.forEach((h, i) => (o[h] = f[i] ?? "")); if (keep(o)) rows.push(o); } };
  for await (const chunk of gz) { buf += chunk; let i; while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); } }
  if (buf) take(buf);
  return rows;
}
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = <T,>(a: T[], r: () => number) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const num = (s: string) => { const n = parseFloat(s); return isFinite(n) ? n : NaN; };

/** "Brand Name - Colour - Size" (Brian James) -> name without size and colour, colour from the title (more precise than the feed's colour family). */
function splitTitle(title: string, feedColour: string): { name: string; colour: string | null } {
  const parts = title.split(" - ").map((s) => s.trim());
  if (parts.length > 1 && SIZE.test(parts[parts.length - 1])) parts.pop();
  let colour: string | null = null;
  if (parts.length > 1) colour = parts.pop()!;
  return { name: parts.join(" - "), colour: colour || feedColour || null };
}

(async () => {
  const [out, given] = process.argv.slice(2);
  if (!out) throw new Error("usage: awin-select.ts <out-dir> [feed.csv.gz]");
  mkdirSync(out, { recursive: true });
  let file = given;
  if (!file) {
    const url = (process.env.AWIN_FEED_URL_BRANDS ?? "").trim();
    if (!url) throw new Error("AWIN_FEED_URL_BRANDS is not set");
    const res = await fetch(url).catch(() => null);                                 // error text never includes the URL
    if (!res || !res.ok || !res.body) throw new Error(`feed download failed (HTTP ${res?.status ?? "none"})`);
    file = `${out}/brands.csv.gz`;
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
  }
  const brandGroup = new Map<string, number>(); GROUPS.forEach((g, i) => g.brands.forEach((b) => brandGroup.set(b, i)));
  const rows = await load(file, (r) => brandGroup.has(r.brand_name.toLowerCase().trim()));
  const selection: AwinItem[] = [], links: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {};
  for (const [gi, g] of GROUPS.entries()) {
    if (ONLY.length && !ONLY.includes(g.name.toLowerCase())) continue;
    // one unit = one product page (Brian James: the colour is in the page) or page + colour (Tooled Up); sizes are separate rows, a unit counts as in stock when any row is
    const units = new Map<string, Record<string, string>>();
    let skipped = { notStock: 0, noLink: 0, noImage: 0, notWanted: 0, other: 0 };
    for (const r of rows) {
      if (brandGroup.get(r.brand_name.toLowerCase().trim()) !== gi || r.merchant_name !== g.merchant || r.currency !== g.currency) continue;
      if (r.in_stock !== "1") { skipped.notStock++; continue; }
      if (!r.aw_deep_link.startsWith("https://www.awin1.com/") || !r.merchant_deep_link) { skipped.noLink++; continue; }
      if (!r.merchant_image_url) { skipped.noImage++; continue; }
      if (g.shoes ? !FOOTWEAR.has(r.merchant_category.toLowerCase()) || inferGender(null, r.product_name, r.merchant_deep_link) === "kids" : NOT_WANTED.test(`${r.merchant_category} ${r.product_name}`)) { skipped.notWanted++; continue; }
      const path = r.merchant_deep_link.split(/[?#]/)[0];
      const key = g.merchant === "Tooled Up" ? `${path}|${normKey(r.colour)}|${r.merchant_image_url}` : path;
      if (!units.has(key)) units.set(key, r);
    }
    const byCat = new Map<string, { r: Record<string, string>; base: string; colour: string | null; name: string }[]>();
    for (const r of units.values()) {
      const { name, colour } = g.merchant === "Brian James" ? splitTitle(r.product_name, r.colour) : { name: r.product_name, colour: r.colour || null };
      const cat = inferCategory(r.merchant_category, name);
      if (cat === "other" || (cat === "shoes") !== !!g.shoes) { skipped.other++; continue; }
      (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push({ r, base: normKey(`${r.brand_name} ${name}`), colour, name });
    }
    // spread over categories (round robin over shuffled lists), at most MAX_COLOURS colours per product, until the cap
    const rnd = rng(1000 + gi); const lists = [...byCat.entries()].sort().map(([c, l]) => [c, shuffle(l, rnd)] as const);
    const perBase = new Map<string, number>(); const picked: typeof lists[number][1] = []; const catCount: Record<string, number> = {};
    for (let round = 0; picked.length < g.cap; round++) {
      let any = false;
      for (const [c, l] of lists) {
        if (picked.length >= g.cap) break;
        while (l.length) { const x = l.shift()!; if (!g.shoes && (perBase.get(x.base) ?? 0) >= MAX_COLOURS) continue; perBase.set(x.base, (perBase.get(x.base) ?? 0) + 1); picked.push(x); catCount[c] = (catCount[c] ?? 0) + 1; any = true; break; }
      }
      if (!any) break;
    }
    for (const x of picked) {
      const r = x.r, price = num(r.search_price), rrp = num(r.rrp_price);
      const m = /\/m-(\d+)\.aspx/.exec(r.merchant_deep_link);
      const id = g.merchant === "Brian James" ? `bj:${m?.[1] ?? r.merchant_product_id}` : g.shoes ? `bm:${r.merchant_deep_link.split(/[?#]/)[0].split("/").pop()}` : `tu:${r.merchant_product_id}`;
      if (!isFinite(price)) continue;
      const brand = r.brand_name.trim().replace(/^hugo boss$/i, "Hugo Boss");
      selection.push({ id, merchant: g.merchant, brand, name: x.name, colour: x.colour, url: r.merchant_deep_link.split(/[?#]/)[0], categoryText: r.merchant_category,
        image: r.merchant_image_url, price, rrp: isFinite(rrp) ? rrp : null, currency: g.currency,
        gender: g.shoes ? inferGender(null, x.name, r.merchant_deep_link) : inferGender("men", r.merchant_category, x.name) });
      links.push({ source: g.shoes ? "bennimarceau" : g.merchant === "Brian James" ? "brianjames" : "tooledup", external_id: id, merchant: g.merchant, aw_deep_link: r.aw_deep_link, feed_product_id: r.aw_product_id,
        feed_price: price, feed_currency: g.currency, feed_rrp: isFinite(rrp) ? rrp : null, feed_in_stock: true });
    }
    report[g.name] = { cap: g.cap, units: units.size, picked: picked.length, byCategory: catCount, skipped };
  }
  writeFileSync(`${out}/selection.json`, JSON.stringify(selection));
  writeFileSync(`${out}/links.json`, JSON.stringify(links));
  console.log(JSON.stringify(report, null, 1), "total", selection.length);
})().catch((e) => { console.error(String(e).replace(/https?:\/\/\S+/g, "<url>")); process.exit(1); });

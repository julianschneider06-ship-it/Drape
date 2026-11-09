// Feed-based stock + price refresh of the Awin shops (kind awin). Manual, no AI, no paid call.
// Usage: npx tsx scripts/refresh-awin-stock.ts [--apply] [--shop slug]... [--min-match 0.5] [--dir <scratch dir>]
// Reads AWIN_FEED_URL and AWIN_FEED_URL_BRANDS (trimmed) from the environment, downloads both feeds to a scratch folder OUTSIDE the repo and compares them with our
// offers through the database function awin_refresh (dry run by default = counts only; --apply writes, UPDATE only, 30% price guard per product (a price more than 30% off the stored one is rejected and reported), never deletes).
// Feed URLs, aw_deep_link values and tokens are never printed, logged or written. Needs DRAPE_PIPELINE_TOKEN (rpc rights: awin_refresh, shop_market_list, shop_log_add).
import { createReadStream, createWriteStream, mkdirSync, mkdtempSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { rpc } from "../src/ingest/gateway";
import { SOURCES } from "../src/ingest/sources";

/** One entry per Awin shop: the feed merchant and how the adapter built the external id at import (scripts/awin-select.ts). */
const KEY = {
  brianjames: (r: Row) => `bj:${/\/m-(\d+)\.aspx/.exec(r.merchant_deep_link)?.[1] ?? r.merchant_product_id}`,
  tooledup: (r: Row) => `tu:${r.merchant_product_id}`,
  bennimarceau: (r: Row) => `bm:${path(r).split("/").pop()}`,
  viaduct: (r: Row) => `vc:${path(r).split("/").pop()}`,
  tluxy: (r: Row) => `tl:${path(r).split("/").pop()}`,
} as Record<string, (r: Row) => string>;
type Row = Record<string, string>;
const path = (r: Row) => r.merchant_deep_link.split(/[?#]/)[0];
interface Agg { in_stock: boolean; price: number; rrp: number | null; image: string | null }

function parseLine(s: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out;
}
async function readFeed(file: string, onRow: (r: Row) => void) {
  const gz = createReadStream(file).pipe(createGunzip()); gz.setEncoding("utf8");
  let buf = "", rec = "", header: string[] | null = null;
  const take = (line: string) => { rec = rec ? rec + "\n" + line : line; if ((rec.match(/"/g)?.length ?? 0) % 2) return; const f = parseLine(rec); rec = "";
    if (!header) header = f; else { const o: Row = {}; header.forEach((h, i) => (o[h] = f[i] ?? "")); onRow(o); } };
  for await (const chunk of gz) { buf += chunk; let i; while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); } }
  if (buf) take(buf);
}
async function download(envName: string, file: string) {
  const url = (process.env[envName] ?? "").trim();
  if (!url) throw new Error(`${envName} is not set`);
  const res = await fetch(url).catch(() => null);                                  // the error text never includes the URL
  if (!res || !res.ok || !res.body) throw new Error(`${envName}: feed download failed (HTTP ${res?.status ?? "none"}), nothing refreshed`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
}
const num = (s: string) => { const n = parseFloat(s); return isFinite(n) ? n : NaN; };

(async () => {
  const args = process.argv.slice(2), has = (f: string) => args.includes(f), val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const apply = has("--apply"), minMatch = Number(val("--min-match") ?? 0.5);
  const only = args.flatMap((a, i) => (a === "--shop" ? [args[i + 1]] : []));
  const shops = SOURCES.filter((s) => s.kind === "awin" && (!only.length || only.includes(s.slug)));
  if (!shops.length) throw new Error("no awin shop selected");
  const dir = val("--dir") ?? mkdtempSync(`${tmpdir()}/awin-refresh-`);
  if (dir.startsWith(process.cwd())) throw new Error("--dir must be outside the repo");
  mkdirSync(dir, { recursive: true });
  const files = [`${dir}/feed1.csv.gz`, `${dir}/feed2.csv.gz`];
  await download("AWIN_FEED_URL", files[0]); await download("AWIN_FEED_URL_BRANDS", files[1]);   // either feed failing = stop (a partial feed would mark shops as gone)

  const bySlug = new Map(shops.map((s) => [s.slug, s]));
  const byMerchant = new Map(shops.map((s) => [(s.options as { merchant: string }).merchant, s]));
  const agg = new Map<string, Map<string, Agg>>(shops.map((s) => [s.slug, new Map()]));
  for (const f of files) await readFeed(f, (r) => {
    const s = byMerchant.get(r.merchant_name); if (!s) return;
    const o = s.options as { currency: string };
    if (r.currency !== o.currency || !r.merchant_deep_link) return;
    const id = KEY[s.slug](r), price = num(r.search_price); if (!isFinite(price)) return;
    const rrp = num(r.rrp_price), stock = r.in_stock === "1", m = agg.get(s.slug)!, cur = m.get(id);
    const row: Agg = { in_stock: stock, price, rrp: isFinite(rrp) ? rrp : null, image: r.merchant_image_url || null };
    // a product page = many size rows: in stock when any row is, price of the cheapest in-stock row
    if (!cur) m.set(id, row);
    else if (stock && (!cur.in_stock || price < cur.price)) m.set(id, row);
    else if (stock === cur.in_stock && !stock && price < cur.price) m.set(id, row);
  });

  const frozen = new Set((await rpc<{ shop: string; frozen: boolean }[]>("shop_market_list", {})).filter((m) => m.frozen).map((m) => m.shop));
  const today = new Date().toISOString().slice(0, 10), logRows: Record<string, unknown>[] = [];
  console.log(apply ? "APPLY" : "DRY RUN (counts only)");
  for (const s of shops) {
    const o = s.options as { trustRrp?: boolean; country?: string };
    if (frozen.has(s.slug)) { console.log(s.slug, "frozen: skipped"); continue; }
    const ids = new Set(await rpc<string[]>("awin_refresh", { p_slug: s.slug, p_mode: "ids" }));
    const feed = agg.get(s.slug)!, items = [...ids].filter((id) => feed.has(id)).map((id) => { const a = feed.get(id)!;
      return { external_id: id, availability: a.in_stock ? "in_stock" : "out_of_stock", price_cents: Math.round(a.price * 100),
        compare_at_cents: o.trustRrp && a.rrp && a.rrp > a.price ? Math.round(a.rrp * 100) : null, image: a.image }; });
    if (items.length < minMatch * ids.size) { console.log(s.slug, `REFUSED: only ${items.length}/${ids.size} offers found in the feeds (< ${minMatch}), nothing written`); continue; }
    const r = await rpc<Record<string, unknown>>("awin_refresh", { p_slug: s.slug, p_mode: apply ? "apply" : "plan", p_items: items });
    const res = (r.result ?? {}) as Record<string, number>;
    const changedShare = (Number(r.changed) / Number(r.offers) * 100).toFixed(1);
    console.log(s.slug, JSON.stringify({ ...r, result: undefined, applied_counts: apply && r.applied ? res : undefined, changed_share_pct: changedShare }));
    if (apply) logRows.push({ shop: s.slug, job_id: null, attempt: 1, status: r.applied ? "ok" : "skipped", http_code: null, products_seen: items.length, market: o.country ?? null,
      skipped_reason: (r.applied ? `refreshed by script on ${today}, manual` : `price guard: ${r.price_rejected}/${r.matched} price changes over 30%, nothing applied (script ${today})`).slice(0, 200) });
  }
  if (apply && logRows.length) await rpc("shop_log_add", { p_rows: logRows });
})().catch((e) => { console.error(String(e).replace(/https?:\/\/\S+/g, "<url>")); process.exit(1); });

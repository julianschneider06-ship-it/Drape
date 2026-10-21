// Stock and price refresh (background job, idempotent, NO AI and no paid call). Re-reads the public product feeds (Shopify /products.json) of the shops and
// updates availability, price and compare-at price of the EXISTING offers (database function offers_refresh: only differing rows change, every matched row
// gets last_seen_at = now()). Offers that are no longer in a completely read feed count as sold out. When anything changed, the composer catalogue snapshot is
// rebuilt (scripts/build-catalogue.ts: a new snapshot version only appears when the content changed).
// Respects robots.txt and the per-host rate limit (src/ingest/http.ts); a host that answers 401 / 403 / 404 / 410 / 429 / 503 (or disallows the path) is skipped and
// reported, never retried through another route. Intended schedule: once a day (not scheduled yet).
// Usage: DRAPE_PIPELINE_TOKEN=... npx tsx scripts/refresh-stock.ts [--source slug]... [--dry-run] [--no-snapshot] [--concurrency 2]
import { spawnSync } from "node:child_process";
import { createAdapter } from "../src/ingest/adapters";
import { rpc } from "../src/ingest/gateway";
import { sink } from "../src/ingest/sink";
import { SOURCES } from "../src/ingest/sources";
import type { SourceConfig } from "../src/ingest/types";

const args = process.argv.slice(2);
const many = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));
const flag = (n: string) => args.includes(`--${n}`);
const DRY = flag("dry-run"), CONC = Number(many("concurrency")[0] ?? 2), only = many("source");
const t0 = Date.now();

interface Item { external_id: string; availability: string; price_cents: number | null; compare_at_cents: number | null }
const tot = { shops: 0, skipped: 0, checked: 0, became_sold_out: 0, back_in_stock: 0, price_changed: 0, sale_started: 0, sale_ended: 0, delisted: 0, feed_ready_changed: 0 };
const skipped: string[] = [];

async function refresh(cfg: SourceConfig) {
  const { exclude: _e, only: _o, ...opts } = (cfg.options ?? {}) as Record<string, unknown>;       // every category: availability and price do not depend on it
  const adapter = createAdapter({ ...cfg, options: opts });
  const items = new Map<string, Item>();
  let cursor: Record<string, unknown> | null = null, complete = false, lastLen = 0, pages = 0;
  try {
    do {
      const page = await adapter.fetchPage(cursor); pages++; lastLen = page.items.length;
      for (const raw of page.items) { const n = adapter.normalize(raw); if (n) items.set(raw.externalId, { external_id: raw.externalId, availability: n.availability, price_cents: n.priceCents ?? null, compare_at_cents: n.compareAtCents ?? null }); }
      cursor = page.next;
    } while (cursor);
    complete = lastLen < 250;                                   // the last page was not full: the whole feed was read (a page limit would end on a full page)
  } catch (e) {
    const m = String(e); skipped.push(`${cfg.slug}: ${m.replace(/^Error: /, "").slice(0, 90)}`); tot.skipped++; return;   // 401 / 403 / 404 / 410 / 429 / 503 / robots: skip the host, no retry through another route
  }
  tot.shops++;
  if (DRY) { console.log(`[${cfg.slug}] dry run: ${items.size} items, complete ${complete}`); return; }
  const id = (await sink.upsertSource({ slug: cfg.slug, name: cfg.name, kind: cfg.kind, base_url: cfg.baseUrl, config: cfg.options ?? {} })).id;
  const r = await rpc<Record<string, number>>("offers_refresh", { p_source_id: id, p_items: [...items.values()], p_complete: complete });
  for (const k of Object.keys(r)) (tot as Record<string, number>)[k] = ((tot as Record<string, number>)[k] ?? 0) + r[k];
  const changed = r.became_sold_out + r.back_in_stock + r.price_changed + r.sale_started + r.sale_ended + r.delisted;
  if (changed) console.log(`[${cfg.slug}] ${pages} pages, checked ${r.checked}: sold out ${r.became_sold_out}, back ${r.back_in_stock}, price ${r.price_changed}, sale +${r.sale_started} -${r.sale_ended}, delisted ${r.delisted} (feed-ready affected ${r.feed_ready_changed})`);
}

(async () => {
  const list = SOURCES.filter((s) => s.kind === "shopify" && (!only.length || only.includes(s.slug)));
  console.log(`stock refresh: ${list.length} shops, concurrency ${CONC}${DRY ? ", DRY RUN" : ""}`);
  let i = 0; await Promise.all(Array.from({ length: CONC }, async () => { while (i < list.length) await refresh(list[i++]); }));
  console.log(`\nSUMMARY (${((Date.now() - t0) / 1000) | 0}s): shops read ${tot.shops}, skipped ${tot.skipped}, offers checked ${tot.checked}`);
  console.log(`  became sold out ${tot.became_sold_out}, back in stock ${tot.back_in_stock}, price changed ${tot.price_changed}, sale started ${tot.sale_started}, sale ended ${tot.sale_ended}, delisted (not in the feed any more) ${tot.delisted}; feed-ready products affected ${tot.feed_ready_changed}`);
  if (skipped.length) console.log(`  skipped hosts:\n    ${skipped.join("\n    ")}`);
  const changed = tot.became_sold_out + tot.back_in_stock + tot.price_changed + tot.sale_started + tot.sale_ended + tot.delisted;
  if (!DRY && changed && !flag("no-snapshot")) {
    console.log("\nsomething changed: rebuilding the catalogue snapshot ...");
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/build-catalogue.ts"], { stdio: "inherit", env: process.env });
    if (r.status !== 0) console.log("snapshot rebuild failed (exit " + r.status + "); run scripts/build-catalogue.ts again");
  } else console.log(changed ? "\n(snapshot rebuild skipped)" : "\nnothing changed: snapshot version stays");
})().catch((e) => { console.error(e); process.exit(1); });

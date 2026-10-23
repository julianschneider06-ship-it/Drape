// Stock and price refresh (manual run; the daily scheduled run is the job queue: see docs/architecture.md "Job queue"). NO AI and no paid call.
// Per shop logic: src/ingest/refresh.ts. When anything changed, the composer catalogue snapshot is rebuilt (src/outfits/build-snapshot.ts).
// Usage: DRAPE_PIPELINE_TOKEN=... npx tsx scripts/refresh-stock.ts [--source slug]... [--dry-run] [--no-snapshot] [--concurrency 2]
import { rpc } from "../src/ingest/gateway";
import { refreshShop, type ShopResult } from "../src/ingest/refresh";
import { SOURCES } from "../src/ingest/sources";
import { buildSnapshot } from "../src/outfits/build-snapshot";

const args = process.argv.slice(2);
const many = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));
const flag = (n: string) => args.includes(`--${n}`);
const DRY = flag("dry-run"), CONC = Number(many("concurrency")[0] ?? 2), only = many("source");
const t0 = Date.now();
const tot: Record<string, number> = { shops: 0, skipped: 0, checked: 0, became_sold_out: 0, back_in_stock: 0, price_changed: 0, sale_started: 0, sale_ended: 0, delisted: 0, feed_ready_changed: 0 };
const skipped: string[] = [], logRows: Record<string, unknown>[] = [];
let changedAny = 0;

(async () => {
  const list = SOURCES.filter((s) => (s.kind === "shopify" || s.kind === "awin") && (!only.length || only.includes(s.slug)));
  console.log(`stock refresh: ${list.length} shops, concurrency ${CONC}${DRY ? ", DRY RUN" : ""}`);
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (i < list.length) {
    const r: ShopResult = await refreshShop(list[i++], { dry: DRY });
    logRows.push({ shop: r.slug, attempt: 1, status: r.status, http_code: r.http, products_seen: r.seen, skipped_reason: r.reason });
    if (r.status !== "ok") { skipped.push(`${r.slug}: ${r.reason}`); tot.skipped++; continue; }
    tot.shops++; changedAny += r.changed;
    for (const k of Object.keys(r.counts)) tot[k] = (tot[k] ?? 0) + r.counts[k];
    if (DRY) console.log(`[${r.slug}] dry run: ${r.seen} items`);
    else if (r.changed) console.log(`[${r.slug}] checked ${r.counts.checked}: sold out ${r.counts.became_sold_out}, back ${r.counts.back_in_stock}, price ${r.counts.price_changed}, sale +${r.counts.sale_started} -${r.counts.sale_ended}, delisted ${r.counts.delisted}`);
  } }));
  console.log(`\nSUMMARY (${((Date.now() - t0) / 1000) | 0}s): shops read ${tot.shops}, skipped ${tot.skipped}, offers checked ${tot.checked}`);
  console.log(`  became sold out ${tot.became_sold_out}, back in stock ${tot.back_in_stock}, price changed ${tot.price_changed}, sale started ${tot.sale_started}, sale ended ${tot.sale_ended}, delisted (not in the feed any more) ${tot.delisted}; feed-ready products affected ${tot.feed_ready_changed}`);
  if (skipped.length) console.log(`  skipped hosts:\n    ${skipped.join("\n    ")}`);
  if (!DRY) try { await rpc("shop_log_add", { p_rows: logRows }); } catch (e) { console.log(`(shop log not written: ${String(e).slice(0, 100)})`); }
  if (!DRY && changedAny && !flag("no-snapshot")) {
    console.log("\nsomething changed: rebuilding the catalogue snapshot ...");
    try { const s = await buildSnapshot({}); console.log(`snapshot ${s.version}: ${s.pieces} pieces, ${s.accs} accessories`); } catch (e) { console.log("snapshot rebuild failed: " + String(e).slice(0, 200) + "; run scripts/build-catalogue.ts again"); }
  } else console.log(changedAny ? "\n(snapshot rebuild skipped)" : "\nnothing changed: snapshot version stays");
})().catch((e) => { console.error(e); process.exit(1); });

// Batch ingestion. Usage: npx tsx scripts/ingest.ts [--source slug]... [--max N] [--dry-run] [--fresh]
// Safe to run twice (upserts by source + external id) and resumable: the cursor is saved after every
// page, and an unfinished (failed/killed) run is continued unless --fresh is given.
import { createAdapter } from "../src/ingest/adapters";
import { SOURCES } from "../src/ingest/sources";
import { sink, toRow } from "../src/ingest/sink";
import { accessoryFamily } from "../src/ingest/rules";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const values = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));
const defaultMax = Number(values("max")[0] ?? 200); // max kept products per source (a source can override with options.max)
const only = values("source");
const dry = flag("dry-run");
const accPass = flag("accessories"); // accessory pass: keep only accessories (also for stores that excluded them), default max 60 per store

type Cursor = Record<string, unknown>;

async function run(slug: string) {
  let cfg = SOURCES.find((s) => s.slug === slug)!;
  if (accPass) { const { exclude: _x, ...o } = (cfg.options ?? {}) as Record<string, unknown>; cfg = { ...cfg, options: { ...o, only: ["accessories"], max: (cfg.options as { accMax?: number } | undefined)?.accMax ?? Number(values("max")[0] ?? 60) } }; }
  const adapter = createAdapter(cfg);
  const feeds = adapter.feedCount ?? 1;
  const max = Number((cfg.options as { max?: number } | undefined)?.max ?? defaultMax);
  const perFeed = Math.ceil(max / feeds);
  const stats = { fetched: 0, kept: 0, skipped: 0, new_offers: 0, pages: 0 };
  const keptInFeed: number[] = Array(feeds).fill(0);
  const dist: Record<string, number> = {};
  // Optional spread / stock options of a source: familyCap = max share of one accessory family, inStockOnly = skip sold-out products.
  const so = (cfg.options ?? {}) as { familyCap?: number; inStockOnly?: boolean; skipWords?: string; catCap?: Record<string, number>; uniqueName?: boolean };
  const skipRx = so.skipWords ? new RegExp(so.skipWords, "i") : null; // product types / titles to leave out (kids, boards, bundles, ...)
  const catKept: Record<string, number> = {};
  const seenNames = new Set<string>(); // uniqueName: colour variants of one item count once
  const famKept: Record<string, number> = {};
  let cursor: Cursor | null = null;
  let sourceId = 0, runId = 0;

  if (!dry) {
    sourceId = (await sink.upsertSource({ slug: cfg.slug, name: cfg.name, kind: cfg.kind, base_url: cfg.baseUrl, config: cfg.options ?? {} })).id;
    const last = flag("fresh") ? null : (await sink.lastRun(sourceId)).run;
    if (last && last.status !== "done" && last.cursor?.next) {
      cursor = last.cursor.next as Cursor;
      Object.assign(stats, last.stats);
      (last.cursor.keptInFeed as number[]).forEach((n, i) => (keptInFeed[i] = n));
      console.log(`[${slug}] resuming run ${last.id} at`, JSON.stringify(cursor));
    }
    runId = (await sink.startRun(sourceId)).id;
  }

  try {
    do {
      const feed = Number(cursor?.feed ?? 0);
      const page = await adapter.fetchPage(cursor);
      stats.pages++;
      const rows = [];
      for (const raw of page.items) {
        stats.fetched++;
        if (keptInFeed[feed] >= perFeed) break;
        const n = adapter.normalize(raw);
        if (!n || n.category === "other" || n.gender === "kids") { stats.skipped++; continue; }
        if (so.inStockOnly && n.availability !== "in_stock") { stats.skipped++; continue; }
        if (skipRx && skipRx.test(`${n.name} ${n.subcategory ?? ""}`)) { stats.skipped++; continue; }
        if (so.uniqueName) { const nk = n.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (seenNames.has(nk)) { stats.skipped++; continue; } seenNames.add(nk); }
        if (so.catCap) { const c = so.catCap[n.category]; if (c != null && (catKept[n.category] ?? 0) >= Math.ceil(perFeed * c)) { stats.skipped++; continue; } catKept[n.category] = (catKept[n.category] ?? 0) + 1; }
        if (so.familyCap) { const f = accessoryFamily(n.subcategory, n.name); if ((famKept[f] ?? 0) >= Math.ceil(perFeed * so.familyCap)) { stats.skipped++; continue; } famKept[f] = (famKept[f] ?? 0) + 1; }
        const k = `${n.gender ?? "none"}/${n.category}`;
        dist[k] = (dist[k] ?? 0) + 1;
        keptInFeed[feed]++;
        rows.push(toRow(n, raw, slug));
      }
      if (!dry) {
        for (let i = 0; i < rows.length; i += 100) stats.new_offers += (await sink.ingest(sourceId, runId, rows.slice(i, i + 100))).new_offers;
      }
      stats.kept += rows.length;
      // Quota for this feed reached: jump to the next feed (or stop after the last one).
      cursor = keptInFeed[feed] >= perFeed ? (feed + 1 < feeds ? { feed: feed + 1, page: 1 } : null) : page.next;
      if (!dry) await sink.progress(runId, cursor ? { next: cursor, keptInFeed } : {}, stats);
      console.log(`[${slug}] page ${stats.pages}: kept ${stats.kept}`);
    } while (cursor);
    if (!dry) await sink.finishRun(runId, "done", stats, {});
  } catch (e) {
    if (!dry) await sink.finishRun(runId, "failed", stats, cursor ? { next: cursor, keptInFeed } : {}, String(e));
    throw e;
  }
  console.log(`[${slug}] done`, JSON.stringify(stats), JSON.stringify(dist));
}

(async () => {
  const todo = SOURCES.filter((s) => s.active !== false && (!only.length || only.includes(s.slug)));
  for (const s of todo) {
    try { await run(s.slug); } catch (e) { console.error(`[${s.slug}] FAILED: ${e}`); }
  }
})();

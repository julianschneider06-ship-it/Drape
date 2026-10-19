// Batch ingestion. Usage: npx tsx scripts/ingest.ts [--source slug]... [--max N] [--dry-run] [--fresh]
// Safe to run twice (upserts by source + external id) and resumable: the cursor is saved after every
// page, and an unfinished (failed/killed) run is continued unless --fresh is given.
import { createAdapter } from "../src/ingest/adapters";
import { SOURCES } from "../src/ingest/sources";
import { sink, toRow } from "../src/ingest/sink";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const values = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));
const defaultMax = Number(values("max")[0] ?? 200); // max kept products per source (a source can override with options.max)
const only = values("source");
const dry = flag("dry-run");

type Cursor = Record<string, unknown>;

async function run(slug: string) {
  const cfg = SOURCES.find((s) => s.slug === slug)!;
  const adapter = createAdapter(cfg);
  const feeds = adapter.feedCount ?? 1;
  const max = Number((cfg.options as { max?: number } | undefined)?.max ?? defaultMax);
  const perFeed = Math.ceil(max / feeds);
  const stats = { fetched: 0, kept: 0, skipped: 0, new_offers: 0, pages: 0 };
  const keptInFeed: number[] = Array(feeds).fill(0);
  const dist: Record<string, number> = {};
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

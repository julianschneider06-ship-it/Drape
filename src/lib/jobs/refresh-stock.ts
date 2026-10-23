// Job "refresh_stock": the daily stock and price refresh as a resumable job (no AI, no paid call).
// One invocation = one chunk of at most CHUNK_MS: it works through the shops, saves its progress in job_requests.progress and returns; the next pg_cron tick
// (every 5 minutes while the job is open) continues where it stopped. Phases: main (all shops, 2 at a time) -> retry (shops that answered 429, once, slowly,
// not before RETRY_AFTER_S after the first pass) -> snapshot (rebuild the composer catalogue when something changed) -> done.
import { rpc } from "@/ingest/gateway";
import { refreshShop, REFRESH_COUNTRY, type ShopResult } from "@/ingest/refresh";
import { SOURCES } from "@/ingest/sources";
import type { SourceConfig } from "@/ingest/types";
import { buildSnapshot } from "@/outfits/build-snapshot";

const CHUNK_MS = 200_000;          // stop starting new shops after this (the function may run 300 s)
const LEASE_S = 420;               // while a chunk runs, no other invocation may take the job
const RETRY_AFTER_S = 600;         // the slow retry of the 429 shops comes at least 10 minutes after the first pass
const RETRY_GAP_MS = 20_000;       // pause between two retried shops
const CONC = 2;

interface Progress {
  phase: "main" | "retry" | "snapshot"; done: string[]; retry: string[]; retried: string[]; pass1_end?: string;
  tot: Record<string, number>; skipped: Record<string, string>; started?: string; invocations: number; snapshot?: string; last_error?: string; force_prices?: boolean; only?: string[]; 
}
const ZERO = () => ({ shops_ok: 0, shops_skipped: 0, offers_checked: 0, became_sold_out: 0, back_in_stock: 0, price_changed: 0, sale_started: 0, sale_ended: 0, delisted: 0, feed_ready_changed: 0, changed: 0, retried_429: 0, recovered_429: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Job = { id: number; progress: Partial<Progress>; attempts: number };
/** overridable for tests (a mocked shop, no waiting minutes) */
export interface RunOpts { sources?: SourceConfig[]; chunkMs?: number; retryAfterS?: number; retryGapMs?: number; retryDelayMs?: number; snapshot?: typeof buildSnapshot }
interface MarketRow { shop: string; country: string | null; frozen: boolean; reason: string | null }

export async function runRefreshChunk(job: Job, o: RunOpts = {}) {
  const t0 = Date.now(), CHUNK = o.chunkMs ?? CHUNK_MS, RETRY_AFTER = o.retryAfterS ?? RETRY_AFTER_S, RETRY_GAP = o.retryGapMs ?? RETRY_GAP_MS, SRC = o.sources ?? SOURCES, snap = o.snapshot ?? buildSnapshot;
  const p: Progress = { phase: "main", done: [], retry: [], retried: [], tot: ZERO(), skipped: {}, invocations: 0, ...job.progress } as Progress;
  p.invocations++; p.started ??= new Date().toISOString();
  const save = (leaseS: number) => rpc("job_progress", { p_id: job.id, p_progress: p, p_lease_s: leaseS });
  const markets = new Map<string, MarketRow>();      // shop_market: other country than the default, or a frozen shop
  const marketOf = (slug: string) => (markets.has(slug) ? markets.get(slug)!.country : REFRESH_COUNTRY);
  const log = (rs: ShopResult[], attempt: number) => rpc("shop_log_add", { p_rows: rs.map((r) => ({ shop: r.slug, job_id: job.id, attempt, status: r.status, http_code: r.http, products_seen: r.seen, skipped_reason: r.reason, market: marketOf(r.slug) ?? "NONE" })) });
  // a frozen shop (no market reproduces its ingested prices) is not fetched; it is logged every run with the reason
  const run = async (cfg: SourceConfig, extra: { minDelayMs?: number } = {}): Promise<ShopResult> => {
    const m = markets.get(cfg.slug);
    if (m?.frozen) return { slug: cfg.slug, status: "skipped", http: null, seen: 0, reason: `frozen: ${m.reason ?? "no market reproduces the ingested prices"}`.slice(0, 120), counts: {}, changed: 0 };
    return refreshShop(cfg, { ...extra, force: p.force_prices, country: marketOf(cfg.slug) });
  };
  const add = (r: ShopResult, retry: boolean) => {
    if (r.status === "ok") {
      p.tot.shops_ok++; p.tot.changed += r.changed; p.tot.offers_checked += r.counts.checked ?? 0;
      for (const k of ["became_sold_out", "back_in_stock", "price_changed", "sale_started", "sale_ended", "delisted", "feed_ready_changed"]) p.tot[k] += r.counts[k] ?? 0;
      if (retry) p.tot.recovered_429++;
    } else if (!retry) { p.tot.shops_skipped++; p.skipped[r.slug] = `${r.http ?? r.status}: ${r.reason ?? ""}`.slice(0, 100); if (r.http === 429) p.retry.push(r.slug); }
    else p.skipped[r.slug] = `${r.http ?? r.status} (retry): ${r.reason ?? ""}`.slice(0, 100);
  };

  try {
    for (const m of await rpc<MarketRow[]>("shop_market_list", {})) markets.set(m.shop, m);
    if (p.phase === "main") {
      const todo = SRC.filter((s) => (s.kind === "shopify" || s.kind === "awin") && !p.done.includes(s.slug) && (!p.only?.length || p.only.includes(s.slug)));
      let i = 0, sinceSave = 0;
      await Promise.all(Array.from({ length: CONC }, async () => {
        while (i < todo.length && Date.now() - t0 < CHUNK) {
          const cfg = todo[i++], r = await run(cfg);
          await log([r], 1); add(r, false); p.done.push(cfg.slug);
          if (++sinceSave % 10 === 0) await save(LEASE_S);
        }
      }));
      if (i >= todo.length) { p.phase = p.retry.length ? "retry" : "snapshot"; p.pass1_end = new Date().toISOString(); }
      else { await save(0); return "continue"; }
    }
    if (p.phase === "retry") {
      const wait = RETRY_AFTER - (Date.now() - Date.parse(p.pass1_end ?? new Date().toISOString())) / 1000;
      if (wait > 0) { await save(Math.ceil(wait)); return "waiting"; }   // not before: the next tick after this time continues
      for (const slug of p.retry.filter((s) => !p.retried.includes(s))) {
        if (Date.now() - t0 > CHUNK) { await save(0); return "continue"; }
        const cfg = SRC.find((s) => s.slug === slug); if (!cfg) { p.retried.push(slug); continue; }
        const r = await run(cfg, { minDelayMs: o.retryDelayMs ?? 6000 });       // slow: 6 s between requests to that host
        await log([r], 2); add(r, true); p.retried.push(slug); p.tot.retried_429++;
        if (r.status === "ok") delete p.skipped[slug];
        await save(LEASE_S); await sleep(RETRY_GAP);
      }
      p.phase = "snapshot";
    }
    if (p.phase === "snapshot") {
      if (p.tot.changed > 0) {
        if (Date.now() - t0 > CHUNK - 60_000) { await save(0); return "continue"; }   // the snapshot needs about a minute: give it a fresh invocation
        const s = await snap({}); p.snapshot = `rebuilt ${s.version} (${s.pieces} pieces, ${s.accs} accessories)`;
      } else p.snapshot = "unchanged (nothing changed)";
    }
    const t = p.tot, still = Object.entries(p.skipped);
    await rpc("job_finish", { p_id: job.id, p_status: "done", p_result: {
      shops_ok: t.shops_ok, shops_skipped_first_pass: t.shops_skipped, offers_checked: t.offers_checked, became_sold_out: t.became_sold_out, back_in_stock: t.back_in_stock, price_changed: t.price_changed,
      sale_started: t.sale_started, sale_ended: t.sale_ended, delisted: t.delisted, feed_ready_affected: t.feed_ready_changed, retried_429: t.retried_429, recovered_429: t.recovered_429,
      still_skipped: still.length, skipped: Object.fromEntries(still.slice(0, 40)), snapshot: p.snapshot, invocations: p.invocations, duration_s: Math.round((Date.now() - Date.parse(p.started!)) / 1000),
    } });
    return "done";
  } catch (e) {
    p.last_error = String(e).slice(0, 300);
    try { await save(0); } catch { /* the lease runs out and the next tick takes over */ }
    return "error";
  }
}

export const JOB_LEASE_S = LEASE_S;

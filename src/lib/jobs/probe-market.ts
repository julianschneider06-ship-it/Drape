// Job "probe_market": finds, per shop, which market (?country=) reproduces the ingested prices, and gathers the evidence for the currency label audit.
// Read-only towards the shops (public product feeds, robots.txt and rate limit respected), writes only shop_market_probe. No AI, no paid call.
import { rpc } from "@/ingest/gateway";
import { FX, LABEL_COUNTRY, probeCountry, type ProbeRow } from "@/ingest/probe";
import { SOURCES } from "@/ingest/sources";

const CHUNK_MS = 200_000, LEASE_S = 420, CONC = 2;
export const WIDE = ["US", "GB", "DE", "CA", "AU", "SE", "JP", "NONE"];
interface Progress { shops?: string[]; wide?: string[]; done: string[]; started?: string; invocations: number; rows: number; last_error?: string }
type Job = { id: number; progress: Partial<Progress>; attempts: number };

export async function runProbeChunk(job: Job) {
  const t0 = Date.now();
  const p: Progress = { done: [], invocations: 0, rows: 0, ...job.progress };
  p.invocations++; p.started ??= new Date().toISOString();
  const save = (lease: number) => rpc("job_progress", { p_id: job.id, p_progress: p, p_lease_s: lease });
  try {
    const todo = SOURCES.filter((s) => s.kind === "shopify" && (!p.shops?.length || p.shops.includes(s.slug)) && !p.done.includes(s.slug));
    let i = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (i < todo.length && Date.now() - t0 < CHUNK_MS) {
        const cfg = todo[i++];
        const base = await rpc<{ label: string | null; items: { id: string; p: number }[] }>("probe_baseline", { p_slug: cfg.slug, p_limit: 400 });
        const map = new Map(base.items.map((x) => [x.id, x.p]));
        const countries = new Set(p.wide?.includes(cfg.slug) ? WIDE : ["US", ...(base.label && LABEL_COUNTRY[base.label] ? [LABEL_COUNTRY[base.label]] : [])]);
        const rows: ProbeRow[] = [];
        for (const c of countries) {
          const r = await probeCountry(cfg, map, c, base.label);
          rows.push(r);
          if (r.http_code && [401, 403, 404, 410, 429, 503].includes(r.http_code)) break;   // blocked: back off, no other country for this shop
        }
        await rpc("probe_store", { p_rows: rows.map((r) => ({ ...r, job_id: job.id })) });
        p.rows += rows.length; p.done.push(cfg.slug);
      }
    }));
    if (i < todo.length) { await save(0); return "continue"; }
    await rpc("job_finish", { p_id: job.id, p_status: "done", p_result: { shops_probed: p.done.length, probe_rows: p.rows, invocations: p.invocations, duration_s: Math.round((Date.now() - Date.parse(p.started!)) / 1000) } });
    return "done";
  } catch (e) {
    p.last_error = String(e).slice(0, 300);
    try { await save(0); } catch { /* the lease runs out and the next tick takes over */ }
    return "error";
  }
}
export { FX };

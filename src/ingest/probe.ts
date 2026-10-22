// Market probe (no AI, no paid call): which ?country= value makes a shop show the prices that were stored at ingestion? Fetches a few pages of the public
// product feed (robots.txt and the per-host delay respected, via the adapter) and compares the price of every product that is also in the stored ingestion data.
import { createAdapter } from "./adapters";
import type { SourceConfig } from "./types";

export interface ProbeRow { shop: string; country: string; sample_n: number; within1: number; within2: number; ratio_median: number | null; http_code: number | null; note: string | null }
/** rough price per US dollar by currency (ranges, because shops round to "nice" prices): evidence that a view is in that currency */
export const FX: Record<string, [number, number]> = { GBP: [0.70, 0.84], EUR: [0.82, 0.98], AUD: [1.40, 1.65], CAD: [1.25, 1.48], SEK: [9, 11.5], JPY: [135, 165], DKK: [6.2, 7.4], NZD: [1.5, 1.8], HUF: [320, 400] };
export const LABEL_COUNTRY: Record<string, string> = { GBP: "GB", EUR: "DE", AUD: "AU", CAD: "CA", SEK: "SE", JPY: "JP", DKK: "DK", NZD: "NZ", HUF: "HU" };

const cheapest = (variants: { price: string; available: boolean }[]) => {
  const avail = variants.filter((v) => v.available), pool = avail.length ? avail : variants;
  return pool.length ? Math.round(Math.min(...pool.map((v) => Number(v.price))) * 100) : 0;
};

/** country "NONE" = no parameter */
export async function probeCountry(cfg: SourceConfig, baseline: Map<string, number>, country: string, label: string | null, maxPages = 3): Promise<ProbeRow> {
  const { exclude: _e, only: _o, feeds: _f, ...opts } = (cfg.options ?? {}) as Record<string, unknown>;     // whole catalogue feed: ids are the same
  if (country !== "NONE") opts.country = country;
  const adapter = createAdapter({ ...cfg, options: opts });
  const ratios: number[] = []; let cursor: Record<string, unknown> | null = null, pages = 0, http: number | null = 200, note: string | null = null;
  try {
    do {
      const page = await adapter.fetchPage(cursor); pages++;
      for (const it of page.items) {
        const base = baseline.get(it.externalId); if (!base) continue;
        const now = cheapest((it.payload as { variants: { price: string; available: boolean }[] }).variants);
        if (now > 0) ratios.push(now / base);
      }
      cursor = page.next;
    } while (cursor && pages < maxPages && ratios.length < 80);
  } catch (e) {
    const m = String(e), code = /HTTP (\d{3})/.exec(m)?.[1]; http = code ? Number(code) : null; note = m.replace(/^Error: /, "").slice(0, 120);
  }
  const sorted = [...ratios].sort((a, b) => a - b), med = sorted.length ? sorted[sorted.length >> 1] : null;
  const range = label ? FX[label] : undefined;
  if (!note && range && ratios.length) note = `fx_share=${(ratios.filter((r) => r >= range[0] && r <= range[1]).length / ratios.length).toFixed(2)}`;
  return { shop: cfg.slug, country, sample_n: ratios.length, within1: ratios.filter((r) => Math.abs(r - 1) <= 0.01).length, within2: ratios.filter((r) => Math.abs(r - 1) <= 0.02).length, ratio_median: med === null ? null : Math.round(med * 1000) / 1000, http_code: http, note };
}

// Stock and price refresh of ONE shop (shared by scripts/refresh-stock.ts and the job runner route). No AI, no paid call.
// Re-reads the public product feed (Shopify /products.json) and updates availability, price and compare-at price of the EXISTING offers through the database
// function offers_refresh. Respects robots.txt and the per-host rate limit (src/ingest/http.ts). A host that answers 401 / 403 / 404 / 410 / 429 / 503 (or
// disallows the path) is skipped and reported, never pushed through another route. The result per shop is returned so the caller can log it (shop_refresh_log).
import { createAdapter } from "./adapters";
import { rpc } from "./gateway";
import { sink } from "./sink";
import type { SourceConfig } from "./types";

export interface ShopResult {
  slug: string; status: "ok" | "skipped" | "error"; http: number | null; seen: number; reason: string | null;
  counts: Record<string, number>;            // offers_refresh result (checked, became_sold_out, back_in_stock, price_changed, sale_started, sale_ended, delisted, feed_ready_changed)
  changed: number;
}
interface Item { external_id: string; availability: string; price_cents: number | null; compare_at_cents: number | null }
/** currency of the ingested offers -> market country (the offers were ingested from the US, where each shop showed its own primary market) */
export const MARKET: Record<string, string> = { USD: "US", GBP: "GB", EUR: "DE", AUD: "AU", CAD: "CA", SEK: "SE", NZD: "NZ", DKK: "DK", JPY: "JP" };
const SKIP_CODES = new Set([401, 403, 404, 410, 429, 503]);

export async function refreshShop(cfg: SourceConfig, o: { dry?: boolean; minDelayMs?: number; force?: boolean; market?: boolean } = {}): Promise<ShopResult> {
  const { exclude: _e, only: _o, ...opts } = (cfg.options ?? {}) as Record<string, unknown>;       // every category: availability and price do not depend on it
  if (o.minDelayMs) opts.minDelayMs = Math.max(Number(opts.minDelayMs ?? 0), o.minDelayMs);
  if (o.market) { const c = MARKET[String(opts.currency ?? "")]; if (c) opts.country = c; }   // market of the ingested currency
  const adapter = createAdapter({ ...cfg, options: opts });
  const items = new Map<string, Item>();
  let cursor: Record<string, unknown> | null = null, complete = false, lastLen = 0;
  try {
    do {
      const page = await adapter.fetchPage(cursor); lastLen = page.items.length;
      for (const raw of page.items) { const n = adapter.normalize(raw); if (n) items.set(raw.externalId, { external_id: raw.externalId, availability: n.availability, price_cents: n.priceCents ?? null, compare_at_cents: n.compareAtCents ?? null }); }
      cursor = page.next;
    } while (cursor);
    complete = lastLen < 250;                                   // the last page was not full: the whole feed was read (a page limit would end on a full page)
  } catch (e) {
    const m = String(e).replace(/^Error: /, ""), code = /HTTP (\d{3})/.exec(m)?.[1];
    const http = code ? Number(code) : null;
    return { slug: cfg.slug, status: http && SKIP_CODES.has(http) ? "skipped" : "error", http, seen: 0, reason: m.slice(0, 120), counts: {}, changed: 0 };   // no retry through another route
  }
  if (o.dry) return { slug: cfg.slug, status: "ok", http: 200, seen: items.size, reason: complete ? null : "partial feed (dry run)", counts: {}, changed: 0 };
  const id = (await sink.upsertSource({ slug: cfg.slug, name: cfg.name, kind: cfg.kind, base_url: cfg.baseUrl, config: cfg.options ?? {} })).id;
  const r = await rpc<Record<string, number>>("offers_refresh", { p_source_id: id, p_items: [...items.values()], p_complete: complete, p_guard: !o.force });
  // guard in the database: more than 30% price changes in one shop = probably another market / currency (Shopify Markets), nothing was applied
  if ((r as unknown as { suspicious?: boolean }).suspicious) return { slug: cfg.slug, status: "skipped", http: null, seen: items.size, reason: `price shift ${r.price_changed}/${r.checked} offers: other market? nothing applied`, counts: {}, changed: 0 };
  const changed = r.became_sold_out + r.back_in_stock + r.price_changed + r.sale_started + r.sale_ended + r.delisted;
  return { slug: cfg.slug, status: "ok", http: 200, seen: items.size, reason: null, counts: r, changed };
}

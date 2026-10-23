// Brand popularity, pure (shared by the server loader, the simulation and the tests): attribution of events (mirrors the SQL function refresh_brand_popularity),
// weighted signal, smoothed factor and the combined multiplier. No I/O.
import { COMBINED_MULT, POPULARITY, POPULARITY_WEIGHTS } from "../config/popularity";

export type PopGender = "men" | "women";
export interface BrandCounts { impressions: number; likes: number; taps: number; outbound_clicks: number; scroll_pasts: number }
export interface PopRow extends BrandCounts { gender: PopGender; brand_norm: string }

/** brand_norm of a catalogue brand name (products.brand_norm is always lower(trim(brand)); the snapshot carries the display brand) */
export const brandKey = (brand: string) => brand.trim().toLowerCase();

// ---- attribution (documented in docs/architecture.md; the SQL function implements the same rules) ----
export interface EventLike { event_type: string; gender: string | null; product_id?: number | null; product_ids?: number[] | null }
export interface ProductLike { gender: string | null; brand_norm: string }
export interface Attribution { gender: PopGender; brand: string; field: keyof BrandCounts; delta: number }

/** One event -> the counts it adds. Gender = the feed's gender (events.gender); missing gender -> the product's own gender if men / women, else skipped. */
export function attributeEvent(e: EventLike, product: (id: number) => ProductLike | undefined): Attribution[] {
  const out: Attribution[] = [];
  const add = (id: number | null | undefined, field: keyof BrandCounts, delta: number) => {
    if (id == null) return;
    const p = product(id); if (!p) return;
    const g = e.gender === "men" || e.gender === "women" ? e.gender : p.gender === "men" || p.gender === "women" ? p.gender : null;
    if (g) out.push({ gender: g, brand: p.brand_norm, field, delta });
  };
  switch (e.event_type) {
    case "impression": for (const id of e.product_ids ?? []) add(id, "impressions", 1); break;   // per outfit event -> one count per main piece
    case "scroll_past": for (const id of e.product_ids ?? []) add(id, "scroll_pasts", 1); break;
    case "tap_product": add(e.product_id, "taps", 1); break;
    case "like": add(e.product_id, "likes", 1); break;
    case "unlike": add(e.product_id, "likes", -1); break;   // an unlike takes the like back
    default: break;   // dwell_ms, swap, outfit_up/down/clear, view_product_click, search_*: not used (the real click is in click_log)
  }
  return out;
}
/** outbound click (click_log row): the product's gender; a unisex product counts for both genders */
export function attributeClick(product: ProductLike): Attribution[] {
  const gs: PopGender[] = product.gender === "men" || product.gender === "women" ? [product.gender] : ["men", "women"];
  return gs.map((gender) => ({ gender, brand: product.brand_norm, field: "outbound_clicks" as const, delta: 1 }));
}
/** counts per `${gender}|${brand}`; negative like totals are floored at 0 (same as the SQL function), devices in `exclude` are skipped */
export function aggregate(events: (EventLike & { device_id?: string })[], clicks: ProductLike[], product: (id: number) => ProductLike | undefined, exclude: ReadonlySet<string> = new Set()): Map<string, PopRow> {
  const m = new Map<string, PopRow>();
  const apply = (a: Attribution) => {
    const k = `${a.gender}|${a.brand}`; let r = m.get(k);
    if (!r) { r = { gender: a.gender, brand_norm: a.brand, impressions: 0, likes: 0, taps: 0, outbound_clicks: 0, scroll_pasts: 0 }; m.set(k, r); }
    r[a.field] += a.delta;
  };
  for (const e of events) { if (e.device_id && exclude.has(e.device_id)) continue; for (const a of attributeEvent(e, product)) apply(a); }
  for (const c of clicks) for (const a of attributeClick(c)) apply(a);
  for (const r of m.values()) r.likes = Math.max(0, r.likes);
  return m;
}

// ---- score and factor ----
export const weightedSignal = (c: BrandCounts) =>
  c.likes * POPULARITY_WEIGHTS.like + c.taps * POPULARITY_WEIGHTS.tap + c.outbound_clicks * POPULARITY_WEIGHTS.click - c.scroll_pasts * POPULARITY_WEIGHTS.scrollPast;

/** average rate of a gender (all its brands): total signal / total impressions */
export function averageRate(rows: readonly BrandCounts[]): number {
  let s = 0, i = 0; for (const r of rows) { s += weightedSignal(r); i += r.impressions; }
  return i > 0 ? s / i : 0;
}

/** factor of one brand: neutral below MIN_IMPRESSIONS (or when the average is not positive), else shrink toward the average and clamp */
export function brandFactor(c: BrandCounts, avgRate: number, cfg = POPULARITY): number {
  if (c.impressions < cfg.minImpressions || !(avgRate > 0)) return 1;
  const smoothed = (weightedSignal(c) + cfg.smoothingK * avgRate) / (c.impressions + cfg.smoothingK);
  return Math.min(cfg.factorMax, Math.max(cfg.factorMin, 1 + cfg.gain * (smoothed / avgRate - 1)));
}

/** brand_norm -> factor for one gender (only brands that differ from 1 are listed); stale or empty input gives an empty map = everything neutral */
export function factorMap(rows: readonly PopRow[], gender: PopGender, updatedAt: string | null, now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  if (!updatedAt || !(now - Date.parse(updatedAt) < POPULARITY.staleHours * 3600_000)) return out;
  const mine = rows.filter((r) => r.gender === gender); if (!mine.length) return out;
  const avg = averageRate(mine);
  for (const r of mine) { const f = brandFactor(r, avg); if (f !== 1) out.set(r.brand_norm, f); }
  return out;
}

/** selection-weight multiplier of one piece: shop preference x brand factor, kept inside COMBINED_MULT; without a brand factor the shop level passes through unchanged */
export function combinedMult(shop: number, brand: number): number {
  if (brand === 1) return shop;
  return Math.min(COMBINED_MULT.max, Math.max(COMBINED_MULT.min, shop * brand));
}

/** whether the boost is on: the app setting AND not switched off by the link (?brand=0 -> body brand 0) */
export const brandBoostOn = (setting: boolean, linkOff: boolean) => setting && !linkOff;

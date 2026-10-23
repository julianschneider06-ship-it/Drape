// Brand factors for the live composer, loaded from table brand_popularity (aggregates only, refreshed daily by pg_cron) through the gateway and kept per function
// instance with the same lifetime as the catalogue snapshot (5 min). A cold instance waits at most COLD_WAIT_MS once; after that, or when the table is empty,
// stale or unreachable, every factor is neutral (an empty map). No database read per page.
import "server-only";
import { gatewayRpc } from "@/lib/gateway";
import { factorMap, type PopGender, type PopRow } from "@/lib/popularity";

const TTL_MS = 5 * 60_000, COLD_WAIT_MS = 600;
interface Loaded { at: number; maps: Record<PopGender, Map<string, number>> }
let cache: Loaded | null = null, inflight: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  inflight ??= gatewayRpc<{ updated_at: string | null; rows: [PopGender, string, number, number, number, number, number][] }>("brand_popularity_get", {})
    .then((r) => {
      const rows: PopRow[] = (r?.rows ?? []).map(([gender, brand_norm, impressions, likes, taps, outbound_clicks, scroll_pasts]) => ({ gender, brand_norm, impressions, likes, taps, outbound_clicks, scroll_pasts }));
      const at = r?.updated_at ?? null;
      cache = { at: Date.now(), maps: { men: factorMap(rows, "men", at), women: factorMap(rows, "women", at) } };
      return cache;
    })
    .catch(() => { cache = { at: Date.now() - TTL_MS + 15_000, maps: cache?.maps ?? { men: new Map(), women: new Map() } }; return cache; })   // keep the last good maps, retry in 15 s
    .finally(() => { inflight = null; });
  return inflight;
}

/** brand_norm -> factor for one gender (brands not listed are 1.0); `defer` runs a background refresh after the response when the runtime allows it */
export async function getBrandFactors(g: PopGender, defer?: (p: Promise<unknown>) => void): Promise<ReadonlyMap<string, number>> {
  if (cache) {
    if (Date.now() - cache.at >= TTL_MS) { const p = load(); if (defer) defer(p); }
    return cache.maps[g];
  }
  const p = load();
  const l = await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), COLD_WAIT_MS))]);
  return l ? l.maps[g] : new Map();
}

// App settings (table app_settings, see docs/architecture.md): server-only, read through the gateway, validated against an allowlist, cached in memory.
// A failed read never breaks anything: the code defaults below apply (they equal the seed values, so behaviour is the same as before the table existed).
import "server-only";
import { gatewayRpc } from "@/lib/gateway";
import { SALE_MARKER_ENABLED } from "@/lib/layout/config";

export const FEED_DEFAULTS = ["base", "dynamic", "hybrid"] as const;
export type FeedDefault = (typeof FEED_DEFAULTS)[number];
export interface Settings { feed_default: FeedDefault; sale_marker_enabled: boolean; icons_enabled: boolean; search_enabled: boolean; liked_outfit_customizable_enabled: boolean; brand_boost_enabled: boolean }
export const CODE_DEFAULTS: Settings = { feed_default: "base", sale_marker_enabled: SALE_MARKER_ENABLED, icons_enabled: true, search_enabled: true, liked_outfit_customizable_enabled: false, brand_boost_enabled: true };

const TTL_MS = 45_000, FAIL_TTL_MS = 15_000;
let cache: { value: Settings; at: number; ok: boolean } | null = null, inflight: Promise<Settings> | null = null;

/** every value is checked; anything unknown or malformed falls back to the code default for that key */
export function validateSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    feed_default: (FEED_DEFAULTS as readonly unknown[]).includes(r.feed_default) ? (r.feed_default as FeedDefault) : CODE_DEFAULTS.feed_default,
    sale_marker_enabled: typeof r.sale_marker_enabled === "boolean" ? r.sale_marker_enabled : CODE_DEFAULTS.sale_marker_enabled,
    icons_enabled: typeof r.icons_enabled === "boolean" ? r.icons_enabled : CODE_DEFAULTS.icons_enabled,
    search_enabled: typeof r.search_enabled === "boolean" ? r.search_enabled : CODE_DEFAULTS.search_enabled,
    brand_boost_enabled: typeof r.brand_boost_enabled === "boolean" ? r.brand_boost_enabled : CODE_DEFAULTS.brand_boost_enabled,
    liked_outfit_customizable_enabled: typeof r.liked_outfit_customizable_enabled === "boolean" ? r.liked_outfit_customizable_enabled : CODE_DEFAULTS.liked_outfit_customizable_enabled,
  };
}

export async function getSettings(): Promise<Settings> {
  const now = Date.now();
  if (cache && now - cache.at < (cache.ok ? TTL_MS : FAIL_TTL_MS)) return cache.value;
  inflight ??= gatewayRpc<unknown>("settings_get", {}, { revalidate: 45 })
    .then((raw) => { cache = { value: validateSettings(raw), at: Date.now(), ok: true }; return cache.value; })
    .catch(() => { cache = { value: cache?.value ?? CODE_DEFAULTS, at: Date.now(), ok: false }; return cache.value; })   // keep the last good value, else the code defaults
    .finally(() => { inflight = null; });
  return inflight;
}

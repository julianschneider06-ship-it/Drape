// Outbound redirect logic (pure, dependencies injected so tests need no database). The target comes ONLY from the database, never from the request.
// aw_deep_link is used as the Location header and nowhere else: it is not returned to browser code, not logged, not put in any body.
export const SURFACES = ["feed", "search", "wishlist", "detail"] as const;
export type Surface = (typeof SURFACES)[number];
export type OutRow = { url: string; shop: string; affiliate_enabled: boolean; aw_deep_link: string | null };
export type OutDeps = {
  resolve: (id: number) => Promise<OutRow | null>;
  log: (row: { product_id: number; shop: string; surface: string; feed_variant: string | null; src: string | null; affiliate: boolean }) => Promise<void>;
  now?: () => number;
};

const AW_PREFIX = "https://www.awin1.com/";
export const DEDUPE_MS = 2000;
const seen = new Map<string, number>();

export function pickTarget(r: OutRow): { url: string; affiliate: boolean } {
  if (r.affiliate_enabled && r.aw_deep_link && r.aw_deep_link.startsWith(AW_PREFIX)) return { url: r.aw_deep_link, affiliate: true };
  return { url: r.url, affiliate: false };
}

// True when the same visitor already clicked the same product+surface within DEDUPE_MS (kept in memory only; the key is never stored).
export function isRepeat(visitor: string, id: number, surface: string, now: number): boolean {
  const key = `${visitor}|${id}|${surface}`;
  const t = seen.get(key);
  if (seen.size > 5000) for (const [k, v] of seen) if (now - v > DEDUPE_MS) seen.delete(k);
  seen.set(key, now);
  return t !== undefined && now - t < DEDUPE_MS;
}

const safeHttp = (u: string) => /^https?:\/\//i.test(u);

export async function handleOut(rawId: string, q: URLSearchParams, visitor: string, deps: OutDeps): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (!/^\d{1,15}$/.test(rawId)) return notFound();
  const id = Number(rawId);
  let row: OutRow | null;
  try { row = await deps.resolve(id); } catch { return new Response("Unavailable", { status: 502, headers: { "cache-control": "no-store" } }); }
  if (!row || !row.url) return notFound();
  const t = pickTarget(row);
  if (!safeHttp(t.url)) return notFound();
  const s = q.get("s") ?? "";
  const surface = (SURFACES as readonly string[]).includes(s) ? s : "unknown";
  const fv = q.get("fv"); const variant = fv === "base" || fv === "dynamic" || fv === "hybrid" ? fv : null;
  const srcRaw = (q.get("src") ?? "").toLowerCase();
  const src = /^[a-z0-9_-]{1,32}$/.test(srcRaw) ? srcRaw : null;
  const now = (deps.now ?? Date.now)();
  if (!isRepeat(visitor, id, surface, now)) {
    // logging must never block or break the redirect
    await Promise.race([deps.log({ product_id: id, shop: row.shop, surface, feed_variant: variant, src, affiliate: t.affiliate }).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  }
  return new Response(null, { status: 302, headers: { location: t.url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

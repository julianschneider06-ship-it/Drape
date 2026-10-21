import { NextRequest, NextResponse } from "next/server";
import { clientIp, isUuid, limited } from "@/lib/ratelimit";
import { dynamicPage, starterPage, starterRows } from "@/lib/dynamic";

export const dynamic = "force-dynamic";

// Dynamic feed PROTOTYPE (client switch ?feed=dynamic; the default feed is untouched).
// GET  /api/dynamic?gender=women|men&starter=<page>  -> a page of the fixed starter set (identical for everyone: CDN cache). Empty items = starter set is over.
// POST /api/dynamic {device_id, gender, startersServed?, recent?: [{ids, style, store}]} -> 6 outfits composed on the fly for this device (not cacheable).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams, gender = q.get("gender"), page = Number(q.get("starter"));
  if ((gender !== "women" && gender !== "men") || !Number.isInteger(page) || page < 0 || page > 100) return NextResponse.json({ error: "params" }, { status: 400 });
  if (limited(`dyn:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const items = await starterPage(gender, page);
    const total = (await starterRows(gender)).length;
    return NextResponse.json({ items, total }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (e) { return NextResponse.json({ error: "unavailable", detail: String(e).slice(0, 120) }, { status: 502 }); }
}

export async function POST(req: NextRequest) {
  let b: { ban?: unknown; device_id?: unknown; gender?: unknown; startersServed?: unknown; recent?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  if (!isUuid(b.device_id) || (b.gender !== "women" && b.gender !== "men")) return NextResponse.json({ error: "params" }, { status: 400 });
  if (limited(`dynp:${clientIp(req)}`, 60, 60_000) || limited(`dynp:${b.device_id}`, 30, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const recent = Array.isArray(b.recent) ? (b.recent as { ids?: unknown; style?: unknown; store?: unknown }[]).slice(-12).flatMap((r) => Array.isArray(r.ids) && typeof r.style === "string" && typeof r.store === "string" ? [{ ids: (r.ids as unknown[]).filter((x): x is number => Number.isInteger(x)).slice(0, 8), style: r.style.slice(0, 24), store: r.store.slice(0, 40) }] : []) : [];
  const startersServed = Number.isInteger(b.startersServed) ? Math.max(0, Math.min(200, b.startersServed as number)) : 0;
  try {
    const banB64 = typeof b.ban === "string" && b.ban.length <= 6000 && /^[A-Za-z0-9+/=]*$/.test(b.ban) ? b.ban : b.ban === "db" ? null : undefined;   // ban list held by the client (default) or "db" = the database copy
    const { items, ms, ban } = await dynamicPage({ device: b.device_id, gender: b.gender, recent, startersServed, banB64: banB64 === undefined ? "" : banB64 });
    return NextResponse.json({ items, ms, ban: banB64 === null ? undefined : ban }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: "unavailable", detail: String(e).slice(0, 120) }, { status: 502 }); }
}

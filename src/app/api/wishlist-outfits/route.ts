import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/ratelimit";
import { WISHLIST_MAX_LIKED } from "@/config/wishlist";
import { MY_OUTFITS_MAX_ACCESSORY_SLOTS, MY_OUTFITS_PAGE_RENDER_MAX } from "@/config/my-outfits";
import { renderMyOutfits, wishlistPage } from "@/lib/wishlist-server";

export const dynamic = "force-dynamic";

// POST /api/wishlist-outfits {gender, ids, seed, from, prev} -> the next small page of outfits built from the device's liked products (ids come from the client),
// the gaps filled with other pieces (their ids are not in `wl`). Read-only; nothing is written, nothing paid, no AI.
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "body" }, { status: 400 }); }
  const gender = b.gender;
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  if (limited(`wishlist:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0).slice(-max) : []);
  const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  if (Array.isArray(b.render)) {   // My Outfits: draw the saved outfits (ids from the device), nothing composed
    const one = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);
    const list = (b.render as Record<string, unknown>[]).slice(0, MY_OUTFITS_PAGE_RENDER_MAX).map((o) => ({ top: one(o?.top), bottom: one(o?.bottom), shoes: one(o?.shoes), acc: (Array.isArray(o?.acc) ? o.acc : []).slice(0, MY_OUTFITS_MAX_ACCESSORY_SLOTS).map(one).filter((x): x is number => x !== null) }));
    try { return NextResponse.json({ items: await renderMyOutfits(gender, list) }, { headers: { "cache-control": "no-store" } }); } catch { return NextResponse.json({ error: "unavailable" }, { status: 502 }); }
  }
  try {
    const r = await wishlistPage(gender, ids(b.ids, WISHLIST_MAX_LIKED), num(b.seed), num(b.from), ids(b.prev, 20));
    return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

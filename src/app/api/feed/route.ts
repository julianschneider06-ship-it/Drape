import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, isUuid, limited } from "@/lib/ratelimit";
import type { FeedResponse } from "@/lib/types";
import { getCat } from "@/lib/dynamic";
import { outfitTags } from "@/outfits/tags";

export const dynamic = "force-dynamic";

// GET /api/feed?gender=women|men[&device=<uuid>][&cursor=<int>]  -> a fixed page of 6 outfits from the precomputed pool.
// Without cursor: the device's start page (not cached). With cursor: identical for everyone (CDN cache).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const gender = q.get("gender");
  const device = q.get("device");
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  const cursorRaw = q.get("cursor");
  const cursor = cursorRaw !== null && /^\d+$/.test(cursorRaw) ? Number(cursorRaw) : null;
  // The device id is only needed to pick the start page of a visit (no cursor yet).
  if (cursor === null && !isUuid(device)) return NextResponse.json({ error: "device" }, { status: 400 });
  if (limited(`feed:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const data = await gatewayRpc<FeedResponse>("feed_list", { p_gender: gender, p_device: cursor === null ? device : null, p_cursor: cursor, p_limit: 6 });
    // additive field: tags per outfit, computed on demand from the catalogue snapshot (best effort: a slow or missing catalogue never blocks the page)
    try {
      const cat = await Promise.race([getCat(gender), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (cat) for (const o of data.items) {
        const ps = [o.top.id, ...(o.bottom ? [o.bottom.id] : []), o.shoes.id].map((id) => cat.byId.get(id));
        if (ps.every(Boolean)) o.tags = outfitTags(cat, { pieces: ps as NonNullable<(typeof ps)[number]>[], accs: (o.accessories ?? []).map((a) => cat.accById.get(a.card.id)).filter((a): a is NonNullable<typeof a> => !!a) });
      }
    } catch { /* no tags */ }
    // A page with an explicit cursor is the same for every device -> cache at the CDN. The start page is per device -> no cache.
    return NextResponse.json(data, { headers: { "cache-control": cursor === null ? "no-store" : "public, s-maxage=300, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

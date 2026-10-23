import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/ratelimit";
import { getCat } from "@/lib/dynamic";
import { shopList } from "@/lib/shops-server";

export const dynamic = "force-dynamic";

// GET /api/shops -> [{ id, name, n }] every shop that is live in the feed (active source, at least one feed-ready piece or accessory), read from the catalogue snapshot.
// Read-only, the same for everyone (CDN cache), no database read per request, nothing about the shop's feed or links is exposed.
export async function GET(req: NextRequest) {
  if (limited(`shops:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const [w, m] = await Promise.all([getCat("women"), getCat("men")]);
    return NextResponse.json({ shops: shopList([w, m]) }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 502 }); }
}

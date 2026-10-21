import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// GET /api/alternatives?outfit=<id>&slot=top|bottom|shoes|acc1|acc2|acc3 -> precomputed alternatives (best first) as feed cards.
// Read-only lookup in a precomputed table; the same for every device, so the CDN caches it.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const outfit = q.get("outfit"), slot = q.get("slot");
  if (!outfit || !/^\d{1,12}$/.test(outfit) || !slot || !/^(top|bottom|shoes|acc[1-3])$/.test(slot)) return NextResponse.json({ error: "params" }, { status: 400 });
  if (limited(`alt:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const items = await gatewayRpc<unknown[]>("alternatives_list", { p_outfit: Number(outfit), p_slot: slot });
    return NextResponse.json({ items }, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, isUuid, limited } from "@/lib/ratelimit";
import type { FeedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/feed?gender=women|men&device=<uuid>&cursor=<int>&limit=6  -> precomputed pool, indexed, no heavy work.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const gender = q.get("gender");
  const device = q.get("device");
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  if (!isUuid(device)) return NextResponse.json({ error: "device" }, { status: 400 });
  if (limited(`feed:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const cursorRaw = q.get("cursor");
  const cursor = cursorRaw !== null && /^\d+$/.test(cursorRaw) ? Number(cursorRaw) : null;
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 6) || 6, 1), 12);
  try {
    const data = await gatewayRpc<FeedResponse>("feed_list", { p_gender: gender, p_device: device, p_cursor: cursor, p_limit: limit });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

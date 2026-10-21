import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, isUuid, limited } from "@/lib/ratelimit";
import type { FeedCard } from "@/lib/types";
import { cleanCompactTags } from "@/outfits/tags";

export const dynamic = "force-dynamic";

// GET /api/likes?device=<uuid> -> the liked products of this anonymous device
export async function GET(req: NextRequest) {
  const device = req.nextUrl.searchParams.get("device");
  if (!isUuid(device)) return NextResponse.json({ error: "device" }, { status: 400 });
  if (limited(`likes:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const items = await gatewayRpc<{ product: FeedCard; liked_at: string }[]>("likes_list", { p_device: device });
    return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

// POST /api/likes { device_id, product_id, liked, ctx? }  (likes belong to the product; the like/unlike event is logged here too)
export async function POST(req: NextRequest) {
  let b: { device_id?: unknown; product_id?: unknown; liked?: unknown; outfit_id?: unknown; slot?: unknown; feed_index?: unknown; gender?: unknown; tags?: unknown };
  try { b = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  if (!isUuid(b.device_id) || !Number.isInteger(b.product_id) || (b.product_id as number) <= 0 || typeof b.liked !== "boolean") return NextResponse.json({ error: "shape" }, { status: 400 });
  if (limited(`like:${clientIp(req)}`, 60, 60_000) || limited(`like:${b.device_id}`, 40, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const productId = b.product_id as number;
  const num = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);
  try {
    await gatewayRpc("like_set", { p_device: b.device_id, p_product: productId, p_liked: b.liked });
    await gatewayRpc("events_append", { p_device: b.device_id, p_events: [{
      event_type: b.liked ? "like" : "unlike", product_id: productId, outfit_id: num(b.outfit_id), feed_index: num(b.feed_index),
      slot: ["top", "bottom", "shoes", "full", "sheet"].includes(b.slot as string) ? b.slot : null,
      gender: b.gender === "women" || b.gender === "men" ? b.gender : null, client_ts: new Date().toISOString(), ctx: (() => { const t = cleanCompactTags(b.tags); return t ? { tags: t } : null; })(),
    }] });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

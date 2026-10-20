import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, isUuid, limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const TYPES = new Set(["impression", "dwell_ms", "like", "unlike", "tap_product", "view_product_click", "scroll_past"]);
const SLOTS = new Set(["top", "bottom", "shoes", "full", "sheet"]);
const int = (v: unknown, max = 2_000_000_000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);

// POST /api/events  { device_id, events: [...] }  (batched by the client; sendBeacon sends text/plain, so parse the raw body)
// Append-only event log. Nothing here can trigger a paid service.
export async function POST(req: NextRequest) {
  let body: { device_id?: unknown; events?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  if (!isUuid(body.device_id) || !Array.isArray(body.events)) return NextResponse.json({ error: "shape" }, { status: 400 });
  if (limited(`ev:${clientIp(req)}`, 60, 60_000) || limited(`ev:${body.device_id}`, 40, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const events = (body.events as Record<string, unknown>[]).slice(0, 50).flatMap((e) => {
    if (typeof e?.event_type !== "string" || !TYPES.has(e.event_type)) return [];
    const ids = Array.isArray(e.product_ids) ? e.product_ids.map((x) => int(x)).filter((x): x is number => x !== null).slice(0, 6) : null;
    const ts = typeof e.client_ts === "string" && !isNaN(Date.parse(e.client_ts)) ? e.client_ts : null;
    return [{
      event_type: e.event_type, product_id: int(e.product_id), product_ids: ids, outfit_id: int(e.outfit_id),
      slot: typeof e.slot === "string" && SLOTS.has(e.slot) ? e.slot : null, feed_index: int(e.feed_index, 100000),
      gender: e.gender === "women" || e.gender === "men" ? e.gender : null, dwell_ms: int(e.dwell_ms, 3_600_000), ctx: null, client_ts: ts,
    }];
  });
  if (!events.length) return NextResponse.json({ ok: true, stored: 0 });
  try {
    const stored = await gatewayRpc<number>("events_append", { p_device: body.device_id, p_events: events });
    return NextResponse.json({ ok: true, stored });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

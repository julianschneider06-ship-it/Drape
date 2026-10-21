import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { getCat } from "@/lib/dynamic";
import { clientIp, isUuid, limited } from "@/lib/ratelimit";
import { summarize } from "@/lib/personalization/summary";
import { applySignals, decodeTaste, eventsToSignals, type EventRow } from "@/outfits/taste-codec";
import { newTaste } from "@/outfits/taste";

export const dynamic = "force-dynamic";

// Debug only (page /taste, not linked in the app; read-only, no paid call).
// POST { taste, gender }            -> summary of the client-held taste of this device
// GET  ?device=<uuid>&gender=...    -> the taste rebuilt from the event log of that device (replay, source of truth)
export async function POST(req: NextRequest) {
  if (limited(`taste:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  let b: { taste?: unknown }; try { b = await req.json(); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  const t = decodeTaste(typeof b.taste === "string" ? b.taste : null);
  return NextResponse.json({ source: "client", summary: summarize(t ?? newTaste()), bytes: typeof b.taste === "string" ? b.taste.length : 0 }, { headers: { "cache-control": "no-store" } });
}
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams, device = q.get("device"), gender = q.get("gender") === "men" ? "men" : "women";
  if (!isUuid(device)) return NextResponse.json({ error: "device" }, { status: 400 });
  if (limited(`taste:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const t0 = performance.now();
    const [rows, cat] = await Promise.all([gatewayRpc<EventRow[]>("events_for_device", { p_device: device, p_gender: gender, p_after: null, p_limit: 5000 }), getCat()]);
    const t = newTaste(); const r = applySignals(cat, t, eventsToSignals(rows));
    return NextResponse.json({ source: "event log replay", events: rows.length, applied: r.applied, skipped: r.skipped, ms: Math.round(performance.now() - t0), summary: summarize(t) }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: "unavailable", detail: String(e).slice(0, 120) }, { status: 502 }); }
}

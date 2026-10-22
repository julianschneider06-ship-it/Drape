import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/ratelimit";
import { getCat, toFeedOutfits } from "@/lib/dynamic";
import { composedFromRow } from "@/outfits/starter";
import { ONBOARDING } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

// GET /api/onboarding -> the two pinned tutorial outfits (ids in src/lib/onboarding.ts) as feed outfits, cards from the in-memory catalogue.
// Same for everyone (CDN cache), no database write, no paid call. A missing piece (left the catalogue) = 404 and the client skips the tutorial.
export async function GET(req: NextRequest) {
  if (limited(`onb:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const cat = await getCat("men");
    const defs = [ONBOARDING.outfitA, ONBOARDING.outfitB];
    if (!defs.every((d) => d.pieces.every((id) => cat.byId.has(id)))) return NextResponse.json({ error: "unavailable" }, { status: 404 });
    const outs = defs.map((d) => composedFromRow(cat, { kind: "three", piece_ids: [...d.pieces], acc_ids: d.accessories.filter((id) => cat.accById.has(id)), score: 0, style: "", contrast: false }));
    const items = await toFeedOutfits(cat, "men", outs, [{}, { top: [...ONBOARDING.outfitB.alts.top] }], 0);
    if (items.length !== 2 || (items[1].alts?.top?.length ?? 0) < 2) return NextResponse.json({ error: "unavailable" }, { status: 404 });
    return NextResponse.json({ items }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 502 }); }
}

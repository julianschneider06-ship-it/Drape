import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/ratelimit";
import { parseExtra, parseFamily, parseItem, parseSeason } from "@/lib/search";
import { searchFacets, searchOutfits } from "@/lib/search-server";

export const dynamic = "force-dynamic";

// GET /api/search?gender=women|men                                   -> option counts (which options have results), same for everyone (CDN cache)
// GET /api/search?gender=..&family=smart&item=shoes[&season=..][&extra=..] -> at most SEARCH_MAX_RESULTS pool outfits, ranked, + "relaxed" when optional filters were loosened
// Read-only on the stored pool; nothing is written, nothing paid. Only the 5 style FAMILIES are accepted: an individual style name (or anything else) is a 400.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams, gender = q.get("gender");
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  if (limited(`search:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    if (!q.has("family") && !q.has("item")) return NextResponse.json({ facets: await searchFacets(gender) }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=1800" } });
    const family = parseFamily(q.get("family")), item = parseItem(q.get("item"));
    if (!family || !item) return NextResponse.json({ error: "family and item are required" }, { status: 400 });
    if ((q.has("season") && !parseSeason(q.get("season"))) || (q.has("extra") && !parseExtra(q.get("extra")))) return NextResponse.json({ error: "option" }, { status: 400 });
    const r = await searchOutfits(gender, { family, item, season: parseSeason(q.get("season")), extra: parseExtra(q.get("extra")) });
    return NextResponse.json(r, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

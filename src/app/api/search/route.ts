import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/ratelimit";
import { parseExtra, parseFamily, parseItem, parseSeason } from "@/lib/search";
import { cleanStyles } from "@/lib/welcome";
import { cleanSignals } from "@/outfits/taste-codec";
import { SEARCH_PAGE } from "@/config/search";
import { searchFacets, searchPage } from "@/lib/search-server";

export const dynamic = "force-dynamic";

// GET  /api/search?gender=women|men  -> option counts of that direction (which options have results, and how many products a search delivers), same for everyone (CDN cache)
// POST /api/search {gender, family, item[, season][, extra][, from][, taste][, seed]} -> the next small page of outfits (each composed around one matching product,
//      in the ranked order of ALL matching products), + total / next. taste (the device's taste string), signals (its not yet folded likes) and seed (welcome style picks) only change the order.
// Read-only; nothing is written, nothing paid. Only the 5 style FAMILIES are accepted: an individual style name (or anything else) is a 400.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams, gender = q.get("gender");
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  if (limited(`search:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    return NextResponse.json({ facets: await searchFacets(gender) }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "body" }, { status: 400 }); }
  const gender = b.gender;
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  if (limited(`search:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const family = parseFamily(b.family), item = parseItem(b.item);
  if (!family || !item) return NextResponse.json({ error: "family and item are required" }, { status: 400 });
  if ((b.season != null && !parseSeason(b.season)) || (b.extra != null && !parseExtra(b.extra))) return NextResponse.json({ error: "option" }, { status: 400 });
  const from = typeof b.from === "number" && Number.isInteger(b.from) && b.from >= 0 ? b.from : 0;
  try {
    const r = await searchPage(gender, { family, item, season: parseSeason(b.season), extra: parseExtra(b.extra) }, from, SEARCH_PAGE,
      { taste: typeof b.taste === "string" ? b.taste : null, seed: cleanStyles(b.seed), signals: cleanSignals(b.signals) });
    return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}

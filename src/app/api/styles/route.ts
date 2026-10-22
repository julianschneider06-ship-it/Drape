import { NextRequest, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, limited } from "@/lib/ratelimit";
import { ALL_STYLES, availableStyles } from "@/lib/welcome";

export const dynamic = "force-dynamic";

// GET /api/styles?gender=women|men -> the styles the welcome picker offers: only those with pool outfits for that gender (read-only, display only).
// Counts come from one grouped read of outfit_pool (rpc style_counts), cached per instance for 10 minutes. If the read fails, the full list is returned (cached briefly).
const cache = new Map<string, { at: number; styles: string[]; ok: boolean }>();
export async function GET(req: NextRequest) {
  const gender = req.nextUrl.searchParams.get("gender");
  if (gender !== "women" && gender !== "men") return NextResponse.json({ error: "gender" }, { status: 400 });
  if (limited(`styles:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const c = cache.get(gender);
  if (c && Date.now() - c.at < (c.ok ? 10 * 60_000 : 30_000)) return NextResponse.json({ styles: c.styles }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  let styles: string[] = ALL_STYLES, ok = false;
  try { styles = availableStyles(await gatewayRpc<Record<string, number>>("style_counts", { p_gender: gender })); ok = true; } catch { /* fall back to the full list */ }
  if (!styles.length) styles = ALL_STYLES;
  cache.set(gender, { at: Date.now(), styles, ok });
  return NextResponse.json({ styles }, { headers: { "cache-control": ok ? "public, s-maxage=300, stale-while-revalidate=3600" : "no-store" } });
}

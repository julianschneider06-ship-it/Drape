import { NextRequest } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp } from "@/lib/ratelimit";
import { handleOut, type OutRow } from "@/lib/out";

export const dynamic = "force-dynamic";

// GET /out/<productId>?s=feed|search|wishlist|detail[&fv=][&src=]: logs the click, then 302 to the offer (or the affiliate link when enabled for the shop).
// The target comes only from the database. Logic and rules: src/lib/out.ts.
export async function GET(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const { productId } = await ctx.params;
  return handleOut(productId, req.nextUrl.searchParams, clientIp(req), {
    resolve: async (id) => (await gatewayRpc<OutRow | null>("out_resolve", { p_product: id })) ?? null,
    log: async (r) => {
      await gatewayRpc("click_log_add", { p_product: r.product_id, p_shop: r.shop, p_surface: r.surface, p_variant: r.feed_variant, p_src: r.src, p_affiliate: r.affiliate }, { retry: false });
    },
  });
}

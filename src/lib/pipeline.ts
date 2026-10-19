// Server-only client for the read-only `sample` action of the pipeline edge function.
import "server-only";

export interface SampleProduct {
  id: number;
  brand: string;
  name: string;
  gender: string | null;
  category: string | null;
  primary_image_url: string;
}

const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";

export async function fetchSample(opts: { after?: number; gender?: string; category?: string; limit?: number }) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.DRAPE_PIPELINE_TOKEN ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "sample", ...opts }),
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`sample failed: ${res.status}`);
  return ((await res.json()) as { products: SampleProduct[] }).products;
}

export interface ReviewRow {
  id: number; brand: string; name: string; gender: string | null; category: string | null; subcategory: string | null;
  feed_slot: string | null; feed_ready: boolean; image_status: string; image_reason: string | null; feed_image_url: string | null;
  store: string; model: string; cost_usd: number | null;
  attributes: {
    style_weights: Record<string, number>; colors: string[]; pattern: string; material: string; silhouette: string; fit: string;
    boldness: number; formality: number; statement_level: number; is_outer_layer: boolean; season: string[]; confidence: number;
    has_model: boolean; view: string; background: string; feed_suitability: number; needs_cutout: boolean; subcategory: string;
  };
}

/** Read-only list of classified products for /review. Calls only the read-only review_list function. */
export async function fetchReview(args: { source?: string; category?: string; feed_slot?: string; feed_ready?: boolean; after?: number; limit?: number }) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.DRAPE_PIPELINE_TOKEN ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "rpc", fn: "review_list", args: { p: args } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`review failed: ${res.status}`);
  return ((await res.json()) as { data: ReviewRow[] }).data;
}

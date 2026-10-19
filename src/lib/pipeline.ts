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

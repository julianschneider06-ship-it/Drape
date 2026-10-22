// Client for the `pipeline` edge function (the database gateway). Needs DRAPE_PIPELINE_TOKEN.
import { createHash } from "node:crypto";
import type { NormalizedProduct, RawItem } from "./types";
import { normKey } from "./rules";
import { currentToken } from "./gateway";

const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = currentToken();
  if (!token) throw new Error("DRAPE_PIPELINE_TOKEN is not set");
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`pipeline ${body.action}: ${res.status} ${JSON.stringify(json)}`);
      return json as T;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

export const sink = {
  upsertSource: (s: { slug: string; name: string; kind: string; base_url: string; config: unknown }) =>
    call<{ id: number }>({ action: "source_upsert", ...s }),
  startRun: (source_id: number) => call<{ id: number }>({ action: "run_start", source_id }),
  lastRun: (source_id: number) =>
    call<{ run: { id: number; status: string; cursor: Record<string, any>; stats: Record<string, any> } | null }>({ action: "run_last", source_id }),
  progress: (run_id: number, cursor: unknown, stats: unknown) => call({ action: "run_progress", run_id, cursor, stats }),
  finishRun: (run_id: number, status: "done" | "failed", stats: unknown, cursor: unknown, error?: string) =>
    call({ action: "run_finish", run_id, status, stats, cursor, error }),
  ingest: (source_id: number, run_id: number, items: unknown[]) =>
    call<{ items: number; new_offers: number }>({ action: "ingest", source_id, run_id, items }),
};

const hash = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");

/** Map normalized product + raw payload to the row shape ingest_batch expects. */
export function toRow(p: NormalizedProduct, raw: RawItem, sourceSlug: string) {
  return {
    external_id: p.externalId, url: p.url, brand: p.brand, name: p.name, gender: p.gender, category: p.category,
    subcategory: p.subcategory, colour: p.colour,
    // Same brand + name + colour = same canonical product, whichever shop sells it.
    // Without a known colour we cannot be sure two items are the same, so they stay separate.
    canonical_key: hash(
      p.colour
        ? [normKey(p.brandKey ?? p.brand), normKey(p.name), normKey(p.colour), p.gender ?? ""].join("|")
        : ["unmerged", sourceSlug, p.externalId].join("|"),
    ),
    price_cents: p.priceCents, compare_at_cents: p.compareAtCents, currency: p.currency,
    availability: p.availability, content_hash: hash(raw.payload), raw: raw.payload,
    images: p.images,
  };
}

// Server-only access to the database through the `pipeline` edge function with the web token.
// The web token can only call the feed/likes/events/review functions (rights are data in pipeline_tokens.allowed_fns).
import "server-only";

const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";

// Timeout + one retry (the database path occasionally stalls). Not retried for events_append (it is not idempotent).
export async function gatewayRpc<T>(fn: string, args: Record<string, unknown>, opts: { retry?: boolean; revalidate?: number } = {}): Promise<T> {
  const retry = opts.retry ?? fn !== "events_append";
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.DRAPE_PIPELINE_TOKEN ?? ""}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "rpc", fn, args }),
        ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" as const }),   // revalidate: Next data cache (keeps a page static / ISR)
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error(`gateway ${fn}: ${res.status}`);
      return ((await res.json()) as { data: T }).data;
    } catch (e) {
      if (!retry || attempt >= 1) throw e;
    }
  }
}

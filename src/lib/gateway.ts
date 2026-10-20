// Server-only access to the database through the `pipeline` edge function with the web token.
// The web token can only call the feed/likes/events/review functions (rights are data in pipeline_tokens.allowed_fns).
import "server-only";

const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";

export async function gatewayRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.DRAPE_PIPELINE_TOKEN ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "rpc", fn, args }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`gateway ${fn}: ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

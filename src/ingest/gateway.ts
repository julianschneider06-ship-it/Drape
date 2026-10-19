// Thin client for allow-listed database functions behind the `pipeline` edge function (batch scripts only).
const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.DRAPE_PIPELINE_TOKEN;
  if (!token) throw new Error("DRAPE_PIPELINE_TOKEN is not set");
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "rpc", fn, args }),
        signal: AbortSignal.timeout(90_000),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
      return json.data as T;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

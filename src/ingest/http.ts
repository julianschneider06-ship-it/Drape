// Polite HTTP: identifying User-Agent, minimum delay between requests per host, retries with backoff.
const UA = "DrapeBot/0.1 (product discovery research; +https://drape-julian-schneider.vercel.app)";
const lastRequest = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeGetJson<T>(url: string, opts: { minDelayMs?: number; retries?: number } = {}): Promise<T> {
  const { minDelayMs = 1500, retries = 4 } = opts;
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequest.get(host) ?? 0) + minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, Date.now());
    let retryAfterMs = 0;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} for ${url}`); // not retryable
      retryAfterMs = Number(res.headers.get("retry-after") ?? 0) * 1000;
      if (attempt >= retries) throw new Error(`HTTP ${res.status} for ${url} after ${attempt} retries`);
    } catch (e) {
      if (String(e).includes("HTTP 4") || attempt >= retries) throw e;
    }
    await sleep(Math.max(retryAfterMs, 2000 * 2 ** attempt)); // 2s, 4s, 8s, 16s
  }
}

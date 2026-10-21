// Polite HTTP: identifying User-Agent, minimum delay between requests per host, retries with backoff.
const UA = "DrapeBot/0.1 (product discovery research; +https://drape-julian-schneider.vercel.app)";
const lastRequest = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// robots.txt: fetched once per host; rules of "User-agent: *" and of DrapeBot are honoured (longest matching Allow / Disallow wins).
const robotsCache = new Map<string, { allow: string[]; disallow: string[] } | null>();
async function robotsRules(origin: string) {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let rules: { allow: string[]; disallow: string[] } | null = null;
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      rules = { allow: [], disallow: [] };
      let applies = false, seenRule = false;
      for (const raw of (await res.text()).split(/\r?\n/)) {
        const line = raw.replace(/#.*/, "").trim(); const i = line.indexOf(":"); if (i < 0) continue;
        const key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
        if (key === "user-agent") { if (seenRule) { applies = false; seenRule = false; } if (val === "*" || /drapebot/i.test(val)) applies = true; }
        else if (applies && (key === "allow" || key === "disallow")) { seenRule = true; if (val) rules[key].push(val); }
      }
    }
  } catch { /* unreachable robots.txt: treat as no rules */ }
  robotsCache.set(origin, rules);
  return rules;
}
export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url); const rules = await robotsRules(u.origin); if (!rules) return true;
  const path = u.pathname + u.search;
  const match = (list: string[]) => Math.max(0, ...list.filter((r) => path.startsWith(r.replace(/\*.*$/, "").replace(/\$$/, "")) && !r.includes("*")).map((r) => r.length));
  return match(rules.allow) >= match(rules.disallow);
}

export async function politeGetJson<T>(url: string, opts: { minDelayMs?: number; retries?: number } = {}): Promise<T> {
  const { minDelayMs = 1500, retries = 4 } = opts;
  const host = new URL(url).host;
  if (!(await robotsAllows(url))) throw new Error(`HTTP 403 robots.txt disallows ${url}`);
  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequest.get(host) ?? 0) + minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, Date.now());
    let retryAfterMs = 0;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 || res.status === 503 || res.status < 500) throw new Error(`HTTP ${res.status} for ${url}`); // 4xx and 503: skip the host, never push through
      retryAfterMs = Number(res.headers.get("retry-after") ?? 0) * 1000;
      if (attempt >= retries) throw new Error(`HTTP ${res.status} for ${url} after ${attempt} retries`);
    } catch (e) {
      if (String(e).includes("HTTP 4") || attempt >= retries) throw e;
    }
    await sleep(Math.max(retryAfterMs, 2000 * 2 ** attempt)); // 2s, 4s, 8s, 16s
  }
}

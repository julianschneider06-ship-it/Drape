// Proves the 429 path of the stock refresh job with a mocked HTTP layer (no real shop, no real database):
// a shop that answers 429 is skipped in the first pass, retried ONCE and slowly (>= 6 s after its first request, after the wait before the retry),
// both attempts are written to shop_refresh_log, and when it still answers 429 it stays skipped (left for the next day: no third request).
// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { runRefreshChunk } from "../src/lib/jobs/refresh-stock";
import type { SourceConfig } from "../src/ingest/types";

const shop = (slug: string): SourceConfig => ({ slug, name: slug, kind: "shopify", baseUrl: `https://${slug}.test`, options: { currency: "USD" } });
const product = { id: 1, title: "Tee", handle: "tee", vendor: "V", product_type: "T-Shirt", tags: [], options: [{ name: "Size", values: ["M"] }],
  variants: [{ price: "20.00", compare_at_price: null, available: true, option1: "M" }], images: [{ src: "https://x.test/a.jpg" }] };

test("429 shop is retried once, slowly, logged twice and left for the next day", async () => {
  const realFetch = globalThis.fetch;
  const hits: Record<string, number[]> = { "ok-shop": [], "limited-shop": [] };
  const logs: Record<string, unknown>[] = []; let progress: Record<string, unknown> = {}; let finished: Record<string, any> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/functions/v1/pipeline")) {            // the database gateway
      const b = JSON.parse(String(init?.body));
      if (b.action === "source_upsert") return json({ id: 1 });
      switch (b.fn) {
        case "shop_market_list": return json({ data: [] });
        case "offers_refresh": return json({ data: { checked: 1, became_sold_out: 0, back_in_stock: 0, price_changed: 0, sale_started: 0, sale_ended: 0, delisted: 0, feed_ready_changed: 0 } });
        case "shop_log_add": logs.push(...b.args.p_rows); return json({ data: b.args.p_rows.length });
        case "job_progress": progress = JSON.parse(JSON.stringify(b.args.p_progress)); return json({ data: null });
        case "job_finish": finished = b.args.p_result; return json({ data: null });
      }
      return json({ error: `unexpected rpc ${b.fn}` }, 500);
    }
    const u = new URL(url); const slug = u.host.replace(".test", "");
    if (u.pathname === "/robots.txt") return new Response("", { status: 404 });
    hits[slug].push(Date.now());
    return slug === "limited-shop" ? new Response("slow down", { status: 429 }) : json({ products: [product] });
  }) as typeof fetch;
  process.env.DRAPE_PIPELINE_TOKEN = "test-token-not-a-secret";
  try {
    const opts = { sources: [shop("ok-shop"), shop("limited-shop")], retryAfterS: 2, retryGapMs: 0 };
    const job = { id: 1, progress: {}, attempts: 1 };
    assert.equal(await runRefreshChunk(job, opts), "waiting");                       // first pass done, the retry waits (not before 2 s)
    assert.equal(hits["limited-shop"].length, 1);
    assert.deepEqual((progress as { retry: string[] }).retry, ["limited-shop"]);
    await new Promise((r) => setTimeout(r, 2100));
    assert.equal(await runRefreshChunk({ ...job, progress }, opts), "done");          // the next tick: the slow retry, then the job ends
    assert.equal(hits["limited-shop"].length, 2, "exactly one retry, no third request");
    assert.ok(hits["limited-shop"][1] - hits["limited-shop"][0] >= 6000, "retry is at least 6 s after the first request to that host");
    assert.equal(hits["ok-shop"].length, 1, "a healthy shop is read once");
    const mine = logs.filter((l) => l.shop === "limited-shop");
    assert.deepEqual(mine.map((l) => [l.attempt, l.status, l.http_code]), [[1, "skipped", 429], [2, "skipped", 429]]);
    assert.equal(logs.filter((l) => l.shop === "ok-shop").length, 1);
    assert.equal(finished!.retried_429, 1); assert.equal(finished!.recovered_429, 0); assert.equal(finished!.still_skipped, 1);
    assert.ok(Object.keys(finished!.skipped).includes("limited-shop"));
  } finally { globalThis.fetch = realFetch; }
});

// Outbound redirect: unknown id = 404, normal target, affiliate target only when the shop is enabled AND a link exists, aw_deep_link never in client code.
// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { handleOut, type OutRow } from "../src/lib/out";

const AW = "https://www.awin1.com/pclick.php?p=1&a=SECRET";
const row = (o: Partial<OutRow> = {}): OutRow => ({ url: "https://shop.test/p/1", shop: "shop", affiliate_enabled: false, aw_deep_link: null, ...o });
let n = 0;
const run = async (r: OutRow | null, qs = "s=feed") => {
  const logs: Record<string, unknown>[] = [];
  const res = await handleOut(r ? "1" : "999", new URLSearchParams(qs), `v${n++}`, { resolve: async () => r, log: async (x) => { logs.push(x); } });
  return { res, logs };
};

test("unknown or inactive id -> 404, nothing logged", async () => {
  const { res, logs } = await run(null);
  assert.equal(res.status, 404); assert.equal(logs.length, 0);
  const bad = await handleOut("abc", new URLSearchParams(), "x", { resolve: async () => row(), log: async () => {} });
  assert.equal(bad.status, 404);
});

test("normal redirect: 302, no-store, shop url, logged as non-affiliate", async () => {
  const { res, logs } = await run(row(), "s=search&src=Insta&fv=hybrid");
  assert.equal(res.status, 302); assert.equal(res.headers.get("location"), "https://shop.test/p/1");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(logs[0], { product_id: 1, shop: "shop", surface: "search", feed_variant: "hybrid", src: "insta", affiliate: false });
});

test("a target url in the request is ignored (no open redirect)", async () => {
  const { res } = await run(row(), "s=feed&url=https://evil.test&to=https://evil.test");
  assert.equal(res.headers.get("location"), "https://shop.test/p/1");
});

test("affiliate target only when enabled AND a link exists", async () => {
  assert.equal((await run(row({ affiliate_enabled: true, aw_deep_link: AW }))).res.headers.get("location"), AW);
  assert.equal((await run(row({ affiliate_enabled: false, aw_deep_link: AW }))).res.headers.get("location"), "https://shop.test/p/1");
  const { res, logs } = await run(row({ affiliate_enabled: true, aw_deep_link: null }));
  assert.equal(res.headers.get("location"), "https://shop.test/p/1"); assert.equal(logs[0].affiliate, false);
  assert.equal((await run(row({ affiliate_enabled: true, aw_deep_link: "https://evil.test/x" }))).res.headers.get("location"), "https://shop.test/p/1");
  const a = await run(row({ affiliate_enabled: true, aw_deep_link: AW }));
  assert.equal(a.logs[0].affiliate, true); assert.ok(!JSON.stringify(a.logs).includes("SECRET")); assert.equal(await a.res.text(), "");
});

test("same visitor + product + surface within 2 s is logged once; the redirect still works", async () => {
  const logs: unknown[] = []; let t = 1_000_000;
  const deps = { resolve: async () => row(), log: async (x: unknown) => { logs.push(x); }, now: () => t };
  const q = new URLSearchParams("s=feed");
  await handleOut("1", q, "dup", deps); const second = await handleOut("1", q, "dup", deps);
  assert.equal(second.status, 302); assert.equal(logs.length, 1);
  t += 2500; await handleOut("1", q, "dup", deps); assert.equal(logs.length, 2);
});

test("aw_deep_link / awin1.com appear in no client-facing code", () => {
  const bad: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(f) && !/^src\/(app\/out|lib\/out\.ts|lib\/gateway)/.test(p) && /aw_deep_link|awin1\.com/.test(readFileSync(p, "utf8"))) bad.push(p); } };
  walk("src");
  // allowed server-only places: the redirect (src/lib/out.ts, src/app/out/*), ingestion adapters and scripts (not shipped to the browser)
  assert.deepEqual(bad.filter((p) => !p.startsWith("src/ingest/") && !p.startsWith("src/app/out/") && p !== "src/lib/out.ts"), []);
  const comps = readdirSync("src/components").map((f) => readFileSync(join("src/components", f), "utf8")).join("\n");
  assert.ok(!/aw_deep_link|awin1/.test(comps));
});

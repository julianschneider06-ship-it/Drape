// End-to-end session test of ?feed=hybrid (Playwright): new device, starter pages, then like / tap / swap / outfit buttons until the personalisation threshold and beyond.
// Usage: node scripts/spike/hybrid-session.mjs <width> <height> women|men minimal|street [outfits]   (needs playwright-core; checks repeats, signal counts, mix, latency)
import { chromium } from "playwright-core";
const B = "https://drape-julian-schneider.vercel.app";
const [w, h, gender, persona, N = "44"] = process.argv.slice(2); const W = Number(w), H = Number(h);
const LIKE = persona === "minimal" ? new Set(["minimalism", "scandi", "quiet_luxury", "classic"]) : new Set(["streetwear", "techwear", "skater", "gorpcore", "athleisure"]);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage();
await p.addInitScript((g) => { try { if (!localStorage.getItem("drape.gender")) localStorage.setItem("drape.gender", g); } catch {} }, gender);
const items = []; const seenIds = new Set(); const reqs = []; const events = []; let t0 = Date.now(); const pages = [];
p.on("request", (r) => { const u = r.url(); if (/\/api\/dynamic/.test(u)) r._t = Date.now(); if (u.includes("/api/events") && r.method() === "POST") { try { for (const e of JSON.parse(r.postData()).events) events.push(e.event_type); } catch {} } });
p.on("requestfinished", async (r) => { if (/\/api\/dynamic/.test(r.url())) { try { const res = await r.response(); const j = await res.json(); const t = r.timing(); const kind = r.method() === "POST" ? "POST" : "starter"; const body = r.method() === "POST" ? JSON.parse(r.postData()) : {};
  const its = j.items ?? []; for (const it of its) if (!seenIds.has(it.id)) { seenIds.add(it.id); items.push({ id: it.id, style: it.dyn?.style, bucket: it.dyn?.bucket, ids: [it.top.id, it.bottom?.id, it.shoes.id].filter(Boolean), pageNo: pages.length }); }
  pages.push({ id: r.url().includes("starter=") ? "s" + r.url().split("starter=")[1] : "p", tStart: r._t - t0, wall: Math.round(t.responseEnd), srv: j.ms ? Math.round(j.ms.total) : null, sent: (body.signals ?? []).length, n: j.taste?.n, personalized: j.taste?.personalized, applied: j.taste?.applied, mix: j.taste?.mix, parts: j.ms ? `ban ${Math.round(j.ms.ban)} comp ${Math.round(j.ms.compose)} cards ${Math.round(j.ms.cards)} taste ${Math.round(j.ms.taste ?? 0)} cat ${Math.round(j.ms.cat?.coldMs ?? 0)}` : "", up: j.ms?.up ?? null, src: j.ms?.cat?.source, items: its.length }); } catch {} } });
await p.goto(B + "/?feed=hybrid", { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
const stats = { liked: 0, taps: 0, swaps: 0, ups: 0, downs: 0, passes: 0, dwells: 0 }; let swipeMs = [];
const outbox = () => p.evaluate((g) => { try { return JSON.parse(localStorage.getItem(`drape.outbox.${g}`) ?? "[]").length; } catch { return -1; } }, gender);
const tasteN = () => p.evaluate((g) => Number(localStorage.getItem(`drape.tasteN.${g}`) ?? 0), gender);
let switched = null;
for (let i = 0; i < Number(N); i++) {
  const sec = p.locator(`section[data-i='${i}']`); if (!(await sec.count())) { await p.waitForTimeout(1500); if (!(await sec.count())) break; }
  await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  const it = items[i]; const likes = it && LIKE.has(it.style); const r = ((i * 7919) % 100) / 100;
  const img = sec.locator("img").first(); const bb = await img.boundingBox().catch(() => null);
  if (likes && bb && r < 0.5) { await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(500); stats.taps++; if (r < 0.3) { await p.getByRole("button", { name: "Like", exact: true }).click({ timeout: 2000 }).then(() => stats.liked++).catch(() => {}); } await p.waitForTimeout(300); await p.mouse.click(W / 2, 30); await p.waitForTimeout(500); }
  if (!likes && bb && r > 0.7) {   // swap away a piece: drag right once
    const before = await img.getAttribute("src"); await p.mouse.move(bb.x + 15, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + 150, bb.y + bb.height / 2, { steps: 5 }); const ts = Date.now(); await p.mouse.up();
    for (let k = 0; k < 80; k++) { const ok = await sec.locator("img").evaluateAll((els, s) => els.some((e) => e.getAttribute("src") !== s && e.complete && e.naturalWidth > 0), before); if (ok) { swipeMs.push(Date.now() - ts); break; } await p.waitForTimeout(10); } stats.swaps++; await p.waitForTimeout(300); }
  if (likes) { await sec.getByRole("button", { name: "I like this outfit" }).click({ timeout: 2000 }).then(() => stats.ups++).catch(() => {}); await p.waitForTimeout(1500 + (i % 3) * 500); stats.dwells++; }
  else if (it && !LIKE.has(it.style) && r < 0.25) { await sec.getByRole("button", { name: "I do not like this outfit" }).click({ timeout: 2000 }).then(() => stats.downs++).catch(() => {}); await p.waitForTimeout(500); }
  else { stats.passes++; }
  const n = (await tasteN()) + Math.max(0, await outbox());
  if (switched === null && n >= 20) switched = { outfit: i, signals: n, page: pages.length };
}
await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, H); await p.waitForTimeout(1500);
await p.evaluate(() => window.dispatchEvent(new Event("pagehide"))); await p.waitForTimeout(2500);
const ob = await outbox(), tn = await tasteN();
const dev = await p.evaluate(() => document.cookie.match(/drape\.device=([^;]+)/)?.[1] ?? localStorage.getItem("drape.device"));
const tasteB64 = await p.evaluate((g) => localStorage.getItem(`drape.taste.${g}`), gender);
const tj = await (await fetch(B + "/api/taste", { method: "POST", body: JSON.stringify({ taste: tasteB64 }) })).json();
// repeats
const pieceCount = new Map(); for (const it of items) for (const id of it.ids) pieceCount.set(id, (pieceCount.get(id) ?? 0) + 1);
const repeatsPieces = [...pieceCount.values()].filter((c) => c > 1).length, outfitDup = items.length - new Set(items.map((x) => x.id)).size;
const ev = {}; for (const e of events) ev[e] = (ev[e] ?? 0) + 1;
console.log(`\n##### ${W}x${H} ${gender} ${persona}: ${items.length} outfits served, ${pages.length} page requests`);
console.log("pages:", pages.map((x, i) => `#${i} ${x.id} t=${x.tStart}ms wall ${x.wall}ms srv ${x.srv ?? "-"}ms sent ${x.sent} [${x.parts ?? ""} up ${x.up?.toFixed(0)}s] n=${x.n ?? "-"}${x.personalized ? " PERSONAL" : ""}${x.src === "bundled" && x.up < 20 ? " (cold " + x.up.toFixed(0) + "s)" : ""}`).join(" | "));
console.log("switch to personalised after outfit", switched?.outfit, "with", switched?.signals, "signals; first personalised page index", pages.findIndex((x) => x.personalized));
const afterBuckets = {}; const first = pages.findIndex((x) => x.personalized); for (const it of items.filter((x) => x.pageNo >= first && first >= 0 && x.pageNo > first)) afterBuckets[it.bucket] = (afterBuckets[it.bucket] ?? 0) + 1;
const tot = Object.values(afterBuckets).reduce((a, c) => a + c, 0); console.log("mix after the switch:", Object.entries(afterBuckets).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join(", "), `(of ${tot} outfits; config 47/28/20/5)`);
const startersN = items.filter((x) => x.pageNo < Math.max(first, 0)).length; console.log("starter-phase outfits", startersN, "| repeated pieces across the session", repeatsPieces, "| duplicate outfit ids", outfitDup);
console.log("actions:", JSON.stringify(stats), "| event log (sent):", JSON.stringify(ev));
const appliedSum = pages.reduce((a, x) => a + (x.applied ?? 0), 0), sentSum = pages.reduce((a, x) => a + x.sent, 0);
console.log(`signals: sent in page requests ${sentSum}, applied by server ${appliedSum}, still in outbox ${ob}, taste n on device ${tn}, taste.n decoded ${tj.summary.events} | counts ${JSON.stringify(tj.summary.counts)}`);
console.log("taste top tops:", JSON.stringify(tj.summary.styles.top.slice(0, 3)), "bottoms:", JSON.stringify(tj.summary.styles.bottom.slice(0, 2)), "less:", JSON.stringify(tj.summary.stylesLess?.top?.slice(0, 2)), "| tags season:", JSON.stringify(tj.summary.tags.season.slice(0, 2)), "occasion:", JSON.stringify(tj.summary.tags.occasion.slice(0, 2)));
console.log("first swipe latencies ms:", swipeMs.slice(0, 6).join(","), "| device", dev);
await b.close();

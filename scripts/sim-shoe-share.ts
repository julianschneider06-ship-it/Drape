// Read-only: share of shoe slots taken by chosen brands in N composed outfits per direction (public POST /api/dynamic, like the app). No DB, no tokens, no AI, no cost.
//   npx tsx scripts/sim-shoe-share.ts --url https://<deployment> [--brands nike,adidas] [--n 300] [--seed 1]
import { randomUUID } from "node:crypto";
import type { FeedOutfit } from "../src/lib/types";

const args = process.argv.slice(2), opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const URL_ = opt("url")?.replace(/\/$/, ""), N = Number(opt("n") ?? 300), SEED = Number(opt("seed") ?? 1);
const BRANDS = (opt("brands") ?? "nike,adidas").split(",").map((s) => s.trim().toLowerCase());
if (!URL_) { console.error("usage: --url https://<deployment> [--brands nike,adidas] [--n 300] [--seed 1]"); process.exit(1); }

async function runCase(g: "men" | "women") {
  const device = randomUUID();
  let ban = "", recent: { ids: number[]; style: string; store: string }[] = [], outfits = 0, shoes = 0, hit = 0;
  for (let page = 0; outfits < N; page++) {
    let res: Response | null = null;
    for (let a = 0; a < 6 && !res?.ok; a++) {
      if (a) await new Promise((r) => setTimeout(r, 4000 * a));
      res = await fetch(`${URL_}/api/dynamic`, { method: "POST", body: JSON.stringify({ device_id: device, gender: g, recent, ban, rs: SEED * 100003 + page }) }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1200));   // stay under the public rate limit
    }
    if (!res?.ok) throw new Error(`dynamic ${res?.status}`);
    const j = (await res.json()) as { items: FeedOutfit[]; ban?: string };
    ban = j.ban ?? ban;
    if (!j.items.length) break;
    for (const o of j.items) {
      if (outfits >= N) break;
      outfits++;
      if (o.shoes) { shoes++; if (BRANDS.includes(String(o.shoes.brand ?? "").trim().toLowerCase())) hit++; }
    }
    recent = [...recent, ...j.items.map((o) => ({ ids: o.dyn!.ids, style: o.dyn!.style, store: o.dyn!.store }))].slice(-12);
  }
  console.log(`${g}: ${outfits} outfits, ${shoes} shoe slots, ${BRANDS.join("+")} ${hit} = ${shoes ? ((hit / shoes) * 100).toFixed(1) : "0"}%`);
}
(async () => { for (const g of ["men", "women"] as const) await runCase(g); })().catch((e) => { console.error(String(e)); process.exit(1); });

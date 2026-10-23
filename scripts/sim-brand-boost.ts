// Read-only simulation of the brand popularity boost: composes N outfits per gender with the boost on and off (fixed seed per page) through the public
// POST /api/dynamic of a deployment, exactly like the app does, and reports the share of main pieces (top / bottom / shoes) for the most and the least popular brands
// plus the largest brand share overall. No DB access, no writes, no tokens, no AI, no cost.
//   npx tsx scripts/sim-brand-boost.ts --url https://<deployment> --top-men a,b,c --bottom-men a,b,c --top-women a,b,c --bottom-women a,b,c [--n 300] [--seed 1] [--seeds 1]
// --seeds k pools k runs (seeds seed .. seed+k-1) per case: a single run of 300 outfits (~900 pieces) is noisy for brands with a share of a few percent.
// The brand lists come from the view dash_brand_popularity (brands with >= 300 impressions, ordered by factor; brand_norm = lower-case brand name).
import { randomUUID } from "node:crypto";
import type { FeedOutfit } from "../src/lib/types";

const args = process.argv.slice(2), opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const URL_ = opt("url")?.replace(/\/$/, ""), N = Number(opt("n") ?? 300), SEED = Number(opt("seed") ?? 1), SEEDS = Number(opt("seeds") ?? 1);
if (!URL_) { console.error("usage: --url https://<deployment> [--top-men a,b,c --bottom-men ... --top-women ... --bottom-women ...] [--n 300] [--seed 1]"); process.exit(1); }
type G = "men" | "women";
const list = (n: string) => (opt(n) ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const delta = (x: number, base: number) => (base > 0 ? `${x >= base ? "+" : ""}${Math.round(((x - base) / base) * 100)}%` : "n/a");

/** N outfits for one gender and one switch state; returns brand -> piece count over the main pieces */
async function runCase(g: G, boost: boolean, seed = SEED): Promise<{ brands: Map<string, number>; pieces: number; outfits: number }> {
  const device = randomUUID(), brands = new Map<string, number>();
  let ban = "", recent: { ids: number[]; style: string; store: string }[] = [], outfits = 0, pieces = 0;
  for (let page = 0; outfits < N; page++) {
    let res: Response | null = null;
    for (let a = 0; a < 6 && !res?.ok; a++) {
      if (a) await new Promise((r) => setTimeout(r, 4000 * a));
      res = await fetch(`${URL_}/api/dynamic`, { method: "POST", body: JSON.stringify({ device_id: device, gender: g, recent, ban, brand: boost ? undefined : 0, rs: seed * 100003 + page }) }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1200));   // stay under the public rate limit (60 / minute)
    }
    if (!res?.ok) throw new Error(`dynamic ${res?.status}`);
    const j = (await res.json()) as { items: FeedOutfit[]; ban?: string };
    ban = j.ban ?? ban;
    if (!j.items.length) break;
    for (const o of j.items) {
      if (outfits >= N) break;
      outfits++;
      for (const c of [o.top, o.bottom, o.shoes]) if (c) { const b = String(c.brand ?? "").trim().toLowerCase(); brands.set(b, (brands.get(b) ?? 0) + 1); pieces++; }
    }
    recent = [...recent, ...j.items.map((o) => ({ ids: o.dyn!.ids, style: o.dyn!.style, store: o.dyn!.store }))].slice(-12);
  }
  return { brands, pieces, outfits };
}

async function main() {
  console.log(`# Brand boost simulation, ${URL_}, ${N} outfits per case, seed ${SEED}${SEEDS > 1 ? ` x ${SEEDS} pooled` : ""}`);
  await fetch(`${URL_}/api/dynamic`, { method: "POST", body: JSON.stringify({ device_id: randomUUID(), gender: "men", rs: 1 }) }).catch(() => null);   // warm-up: loads the catalogue and the brand factors on this instance
  await new Promise((r) => setTimeout(r, 3000));
  for (const g of ["men", "women"] as const) {
    const top = list(`top-${g}`), bottom = list(`bottom-${g}`);
    const pool = async (boost: boolean) => { const t = { brands: new Map<string, number>(), pieces: 0, outfits: 0 }; for (let k = 0; k < SEEDS; k++) { const r = await runCase(g, boost, SEED + k); t.pieces += r.pieces; t.outfits += r.outfits; for (const [b, n] of r.brands) t.brands.set(b, (t.brands.get(b) ?? 0) + n); } return t; };
    const off = await pool(false), on = await pool(true);
    const sh = (r: typeof on, b: string) => (r.pieces ? (r.brands.get(b) ?? 0) / r.pieces : 0);
    const maxOf = (r: typeof on) => { let best = ["", 0] as [string, number]; for (const [b, n] of r.brands) if (n > best[1]) best = [b, n]; return [best[0], r.pieces ? best[1] / r.pieces : 0] as const; };
    console.log(`\n## ${g} (${on.outfits} outfits on / ${off.outfits} off, ${on.pieces} / ${off.pieces} main pieces)`);
    for (const [label, bs] of [["most popular", top], ["least popular", bottom]] as const) {
      for (const b of bs) console.log(`${label.padEnd(14)} ${b.padEnd(22)} off ${pct(sh(off, b)).padStart(6)}  on ${pct(sh(on, b)).padStart(6)}  ${delta(sh(on, b), sh(off, b))}`);
      const so = bs.reduce((s, b) => s + sh(off, b), 0), sn = bs.reduce((s, b) => s + sh(on, b), 0);
      console.log(`${label.padEnd(14)} ${"(3 together)".padEnd(22)} off ${pct(so).padStart(6)}  on ${pct(sn).padStart(6)}  ${delta(sn, so)}`);
    }
    const [mo, so] = maxOf(off), [mn, sn] = maxOf(on);
    console.log(`largest brand   off: ${mo} ${pct(so)}   on: ${mn} ${pct(sn)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

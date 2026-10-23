// Read-only simulation of the shop preference (Profile > Shops): composes N outfits per case with a fixed seed under Normal, More and Less and reports
// the share of pieces from three shops of different size. No DB writes, no AI, no cost. Two ways to get the composer:
//   offline : DRAPE_PIPELINE_TOKEN=... npx tsx scripts/sim-shop-pref.ts            (reads the catalogue snapshot, composes in this process)
//   online  : npx tsx scripts/sim-shop-pref.ts --url https://<deployment>         (drives the public POST /api/dynamic like the app does, fixed seed per page)
// Options: --n 300 (outfits per case)  --seed 1  --women a,b,c / --men a,b,c (shop ids; default: large / medium / small picked per gender from the Normal run)  --extra (also test the smallest shop)
import { randomUUID } from "node:crypto";
import { rpc } from "../src/ingest/gateway";
import { buildCatalogue, unpackSnapshot, type Catalogue } from "../src/outfits/catalogue";
import { BanState } from "../src/outfits/ban";
import { compose, newSession } from "../src/outfits/compose";
import { makeRnd } from "../src/outfits/pool-shared";
import { shopWeights } from "../src/lib/shop-pref";
import { SHOP_PREF } from "../src/config/shop-pref";
import { shopList } from "../src/lib/shops-server";
import type { FeedOutfit } from "../src/lib/types";

const args = process.argv.slice(2), opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const N = Number(opt("n") ?? 300), SEED = Number(opt("seed") ?? 1), URL_ = opt("url")?.replace(/\/$/, "");
type G = "women" | "men"; type Level = "normal" | "more" | "less";
interface Counts { main: Map<string, number>; all: Map<string, number>; outfits: number }
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** one case = N outfits, 6 per page, the way the app asks for them */
async function runCase(run: (page: number, shops: string, recent: { ids: number[]; style: string; store: string }[], ban: string) => Promise<{ items: StoreItem[]; ban: string }>, level: Level, shop: string | null): Promise<Counts> {
  const c: Counts = { main: new Map(), all: new Map(), outfits: 0 };
  const shops = shop && level !== "normal" ? `${shop}:${level === "more" ? "M" : "L"}` : "";
  let ban = "", recent: { ids: number[]; style: string; store: string }[] = [];
  for (let page = 0; c.outfits < N; page++) {
    const r = await run(page, shops, recent, ban); ban = r.ban;
    if (!r.items.length) break;
    for (const o of r.items) { if (c.outfits >= N) break; c.outfits++; for (const s of o.main) { bump(c.main, s); bump(c.all, s); } for (const s of o.acc) bump(c.all, s); }
    recent = [...recent, ...r.items.map((o) => o.recent)].slice(-12);
  }
  return c;
}
interface StoreItem { main: string[]; acc: string[]; recent: { ids: number[]; style: string; store: string } }

const share = (m: Map<string, number>, shop: string) => { let t = 0; for (const v of m.values()) t += v; return t ? (m.get(shop) ?? 0) / t : 0; };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const delta = (x: number, base: number) => (base > 0 ? `${x >= base ? "+" : ""}${Math.round(((x - base) / base) * 100)}%` : "n/a");

async function main() {
  let live: { id: string; name: string; g: { women: number; men: number } }[];
  let runFor: (g: G) => Parameters<typeof runCase>[0];
  if (URL_) {
    live = ((await (await fetch(`${URL_}/api/shops`)).json()) as { shops: typeof live }).shops;
    runFor = (g) => {
      const device = randomUUID();
      return async (page, shops, recent, ban) => {
        let res: Response | null = null;
        for (let a = 0; a < 6 && !(res?.ok); a++) {
          if (a) await new Promise((r) => setTimeout(r, 4000 * a));
          res = await fetch(`${URL_}/api/dynamic`, { method: "POST", body: JSON.stringify({ device_id: device, gender: g, recent, ban, shops: shops || undefined, rs: SEED * 100003 + page }) }).catch(() => null);
          await new Promise((r) => setTimeout(r, 1200));   // stay under the public rate limit (60 / minute)
        }
        if (!res?.ok) throw new Error(`dynamic ${res?.status}`);
        const j = (await res.json()) as { items: FeedOutfit[]; ban?: string };
        return { ban: j.ban ?? ban, items: j.items.map((o) => ({
          main: [o.top.store, ...(o.bottom ? [o.bottom.store] : []), o.shoes.store].filter((s): s is string => !!s), acc: (o.accessories ?? []).map((a) => a.card.store).filter((s): s is string => !!s),
          recent: { ids: o.dyn!.ids, style: o.dyn!.style, store: o.dyn!.store } })) };
      };
    };
  } else {
    const cats: Record<G, Catalogue> = { women: null as never, men: null as never };
    const snap = unpackSnapshot((await rpc<{ data: string }>("snapshot_get", { p_known_version: null })).data);
    for (const g of ["women", "men"] as const) cats[g] = buildCatalogue({ ...snap, pieces: snap.pieces.filter((x) => x.gender === g || (x.gender !== "women" && x.gender !== "men")), accs: snap.accs.filter((x) => x.gender === g || (x.gender !== "women" && x.gender !== "men")) });
    live = shopList([cats.women, cats.men]);
    runFor = (g) => {
      const cat = cats[g], session = newSession(); let ban = new BanState();
      return async (page, shops) => {
        const prefs = new Map<string, "less" | "more">(); for (const p of shops.split(",").filter(Boolean)) prefs.set(p.split(":")[0], p.endsWith("M") ? "more" : "less");
        const r = compose(cat, { gender: g, taste: null, ...(prefs.size ? { shopMult: shopWeights(prefs) } : {}) }, ban, 6, session, makeRnd(SEED * 100003 + page)); ban = r.ban;
        return { ban: "", items: r.outfits.map((o) => ({ main: o.ids.map((id) => cat.byId.get(id)!.store), acc: o.acc.map((a) => cat.accById.get(a.id)!.store), recent: { ids: [...o.ids], style: o.style, store: cat.byId.get(o.ids[0])!.store } })) };
      };
    };
  }
  console.log(`# Shop preference simulation (${URL_ ? "online " + URL_ : "offline"}), ${N} outfits per case, seed ${SEED}, multipliers less ${SHOP_PREF.less} / more ${SHOP_PREF.more}`);
  for (const g of ["women", "men"] as const) {
    const size = (s: (typeof live)[number]) => s.g[g];
    const pool = live.filter((s) => size(s) >= 1).sort((a, b) => size(a) - size(b));
    const normal = await runCase(runFor(g), "normal", null);
    // shops that really supply main pieces (not accessory-only ones): large / medium / small by their share of main pieces in the Normal run, plus (--extra) the smallest shop of the direction
    const byMain = [...normal.main].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const chosen = opt(g)?.split(",") ?? opt("shops")?.split(",") ?? [byMain[0], byMain[Math.floor(byMain.length * 0.2)], byMain[Math.floor(byMain.length * 0.6)], ...(args.includes("--extra") ? [pool[0].id] : [])].filter(Boolean);
    console.log(`\n## ${g}: ${live.length} live shops, ${pool.length} with ${g} products; normal run composed ${normal.outfits} outfits`);
    console.log("| shop | products (this direction) | level | share of all pieces | vs Normal | share of main pieces | vs Normal |\n|---|---|---|---|---|---|---|");
    for (const id of chosen) {
      const s = live.find((x) => x.id === id), nAll = share(normal.all, id), nMain = share(normal.main, id);
      console.log(`| ${s?.name ?? id} | ${s ? size(s) : "?"} | Normal | ${pct(nAll)} | - | ${pct(nMain)} | - |`);
      for (const level of ["more", "less"] as const) {
        const c = await runCase(runFor(g), level, id), a = share(c.all, id), m = share(c.main, id);
        console.log(`| | | ${level === "more" ? "More" : "Less"} | ${pct(a)} | ${delta(a, nAll)} | ${pct(m)} | ${delta(m, nMain)} |`);
      }
    }
    const top = [...normal.all].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${pct(v / [...normal.all.values()].reduce((x, y) => x + y, 0))}`);
    console.log(`\nlargest shares in the Normal run: ${top.join(", ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

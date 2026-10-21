// Ban list simulation: one device (guest profile) scrolls through 500 outfits; report per slot how the banned share grows, score and variety.
import { loadCat } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { BanState, banStats } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { STYLE_KEYS } from "../../src/classify/styles";

(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const configs: { name: string; fraction: number; overall: number }[] = [{ name: "OLD: per group max 40%, 1000 overall", fraction: 0.4, overall: 1000 }, { name: "NEW: per group max 25%, 300 overall", fraction: 0.25, overall: 300 }];
  for (const g of ["men", "women"] as const) for (const cfg of configs) {
    const rnd = makeRnd(5), ses = newSession(); let ban = new BanState(); banStats.calls = banStats.releases = 0;
    const rows: string[] = []; const all: { score: number; style: string; ids: number[]; acc: number[] }[] = [];
    let released0 = 0;
    for (let page = 0; page < 84; page++) {                     // 84 pages x 6 = 504 outfits
      const r = compose(cat, { gender: g, taste: null, banFraction: cfg.fraction, banOverall: cfg.overall }, ban, 6, ses, rnd); ban = r.ban;
      for (const o of r.outfits) all.push({ score: o.score, style: o.style, ids: o.ids, acc: o.acc.map((a) => a.id) });
      if ((page + 1) % 14 === 0) {   // every ~84 outfits
        const eff = ban.effective(cat, g, cfg.fraction); const share = (grp: string) => { const sz = cat.groupSize.get(`${g}:${grp}`) ?? 1; let c = 0; for (const id of eff.banned) if (BanState.group(cat, id) === grp) c++; return Math.round((100 * c) / sz); };
        const blk = all.slice(-84), sc = blk.map((x) => x.score).sort((a, b) => a - b);
        const uniq = (k: number) => new Set(blk.map((x) => x.ids[k])).size;
        rows.push(`  after ${all.length} outfits: banned share top ${share("top")}% bottom ${share("bottom")}% shoes ${share("shoes")}% gloves ${share("acc:gloves")}% rings ${share("acc:ring")}% | last 84: score median ${sc[sc.length >> 1].toFixed(3)} p10 ${sc[Math.floor(sc.length * 0.1)].toFixed(3)}, unique top/bottom/shoes ${uniq(0)}/${uniq(1)}/${uniq(blk[0].ids.length - 1)}, styles ${new Set(blk.map((x) => x.style)).size}, fallback releases so far ${banStats.releases - released0}`);
      }
    }
    const first = all.slice(0, 84).map((x) => x.score).sort((a, b) => a - b), last = all.slice(-84).map((x) => x.score).sort((a, b) => a - b);
    console.log(`${g} / ${cfg.name}: ${all.length} outfits, ban list ${ban.ids.length} ids (${(ban.ids.length * 4 / 1024).toFixed(2)} KB binary, ${(ban.toBase64().length / 1024).toFixed(2)} KB as base64 text in the request), fallback releases ${banStats.releases} of ${banStats.calls} slot lookups, score median first 84 ${first[42].toFixed(3)} -> last 84 ${last[42].toFixed(3)}, repeats of a product within 100 outfits: ${(() => { let rep = 0; const seen = new Map<number, number>(); all.forEach((x, i) => { for (const id of x.ids) { const j = seen.get(id); if (j !== undefined && i - j < 100) rep++; seen.set(id, i); } }); return rep; })()}`);
    for (const r of rows) console.log(r);
  }
  void STYLE_KEYS;
})();

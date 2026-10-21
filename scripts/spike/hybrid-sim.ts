// Hybrid personalization simulation: personas react to the outfits they are served (dwell, scroll past, outfit up/down, tap, like, view, swap, keep),
// the reactions go through the REAL client path (signals -> outbox -> server applySignals -> taste blob encode/decode), and the feed is measured after
// 20, 50 and 100 events on 60 evaluation outfits (taste frozen): on-style / near / new / contrast shares, diversity, repeats, tag shares.
// Usage: SNAP_CACHE=... npx tsx scripts/spike/hybrid-sim.ts [--gender women|men] [--out dump.json]
import { writeFileSync } from "node:fs";
import { STYLE_KEYS } from "../../src/classify/styles";
import { BanState } from "../../src/outfits/ban";
import type { Catalogue, CatPiece } from "../../src/outfits/catalogue";
import { compose, newSession, type ComposedOutfit, type Session } from "../../src/outfits/compose";
import { alternativesFor } from "../../src/outfits/compose-alts";
import { makeRnd } from "../../src/outfits/pool-shared";
import { outfitTags } from "../../src/outfits/tags";
import { newTaste, tasteMatch, topStyles, type Taste } from "../../src/outfits/taste";
import { applySignals, decodeTaste, encodeTaste, type Signal } from "../../src/outfits/taste-codec";
import { loadCat } from "./lib";

type W = Partial<Record<(typeof STYLE_KEYS)[number], number>>;
export interface P { name: string; top: W; bottom: W; shoes: W; likeOnly?: boolean }
export const PERSONAS: P[] = [
  { name: "smart bottoms + relaxed tops", top: { streetwear: 1, minimalism: 0.8, athleisure: 0.6, scandi: 0.6 }, bottom: { business_casual: 1, classic: 0.9, old_money: 0.8, quiet_luxury: 0.6 }, shoes: { classic: 1, minimalism: 0.8, old_money: 0.6 } },
  { name: "streetwear / techwear", top: { streetwear: 1, techwear: 0.9, skater: 0.5 }, bottom: { streetwear: 1, techwear: 0.9, skater: 0.6 }, shoes: { streetwear: 1, techwear: 0.7, sporty: 0.4 } },
  { name: "old money / classic", top: { old_money: 1, classic: 0.9, preppy: 0.7, quiet_luxury: 0.6 }, bottom: { old_money: 1, classic: 0.9, preppy: 0.6, quiet_luxury: 0.6 }, shoes: { old_money: 1, classic: 0.9, preppy: 0.5 } },
  { name: "minimal / scandi", top: { minimalism: 1, scandi: 0.9, quiet_luxury: 0.5 }, bottom: { minimalism: 1, scandi: 0.9, quiet_luxury: 0.5 }, shoes: { minimalism: 1, scandi: 0.8 } },
  { name: "sporty / gorpcore", top: { gorpcore: 1, sporty: 0.8, athleisure: 0.7, techwear: 0.5 }, bottom: { gorpcore: 1, sporty: 0.8, athleisure: 0.7 }, shoes: { gorpcore: 1, sporty: 0.9, athleisure: 0.6 } },
];
export const ONE_STYLE: P = { name: "likes only classic", top: { classic: 1 }, bottom: { classic: 1 }, shoes: { classic: 1 } };
const slotW = (p: P, c: CatPiece) => p[c.slot === "full_body" ? "top" : (c.slot as "top" | "bottom" | "shoes")];
/** persona affinity of a piece 0..1: weighted share of the piece's style vector on the persona's styles */
/** persona affinity of a piece 0..1: persona weight of the piece's dominant style, plus half the weight of its second style (clear and comparable across personas) */
export const aff = (p: P, c: CatPiece) => { const w = slotW(p, c) as Record<string, number>; const o = Array.from(c.vec.keys()).sort((a, b) => c.vec[b] - c.vec[a]); return Math.min(1, (w[STYLE_KEYS[o[0]]] ?? 0) + 0.5 * (w[STYLE_KEYS[o[1]]] ?? 0)); };
const outAff = (p: P, ps: CatPiece[]) => ps.reduce((a, c) => a + aff(p, c), 0) / ps.length;

interface Dev { taste: string; outbox: Signal[]; ban: BanState; session: Session; n: number }
const newDev = (): Dev => ({ taste: "", outbox: [], ban: new BanState(), session: newSession(), n: 0 });

/** one page through the real server path: decode taste, apply the outbox, compose, alternatives, encode */
function page(cat: Catalogue, g: "women" | "men", d: Dev, rnd: () => number, learn = true): { outs: ComposedOutfit[]; alts: Record<string, number[]>[]; taste: Taste; ms: number } {
  const t0 = performance.now();
  const t = decodeTaste(d.taste) ?? newTaste();
  if (learn) { applySignals(cat, t, d.outbox); d.outbox = []; }
  const r = compose(cat, { gender: g, taste: t }, d.ban, 6, d.session, rnd);
  d.ban = r.ban;
  const eff = r.ban.effective(cat, g);
  const alts = r.outfits.map((o) => alternativesFor(cat, g, o, eff, t));
  if (learn) d.taste = encodeTaste(t);
  d.n = t.n;
  return { outs: r.outfits, alts, taste: t, ms: performance.now() - t0 };
}

/** scripted reactions of a persona to one outfit (signals into the outbox) */
function react(cat: Catalogue, p: P, d: Dev, o: ComposedOutfit, alts: Record<string, number[]>, rnd: () => number) {
  let ps = o.ids.map((id) => cat.byId.get(id)!); const tags = outfitTags(cat, { pieces: ps, accs: [], bucket: o.bucket });
  const tg = { se: tags.season_primary, oc: tags.occasion, pk: tags.palette.kind, si: tags.silhouette, fo: tags.formality_level, w: tags.weather, ct: tags.contrast ? 1 : 0 };
  const push = (s: Signal) => d.outbox.push(s);
  // swap away a piece that does not fit (looks at the 2 alternatives, keeps the better one)
  let swapped: CatPiece | null = null;
  const worst = ps.map((c, i) => [aff(p, c), i] as const).sort((a, b) => a[0] - b[0])[0];
  if (worst[0] < 0.25 && rnd() < 0.45) {
    const key = ps[worst[1]].slot === "full_body" ? "top" : ps[worst[1]].slot; const list = (alts[key] ?? []).map((id) => cat.byId.get(id)).filter((x): x is CatPiece => !!x);
    if (list.length) {
      let cur = ps[worst[1]], pos = 0;
      for (let k = 0; k < list.length; k++) { const nx = list[k]; push({ t: "swap", x: cur.id, i: nx.id, a: k + 1, f: pos, o: ps.map((x) => x.id) }); cur = nx; pos = k + 1; }
      const best = [ps[worst[1]], ...list].map((c, i) => [aff(p, c), i] as const).sort((a, b) => b[0] - a[0])[0];
      if (best[1] === 0) push({ t: "swap", x: cur.id, i: ps[worst[1]].id, a: 0, f: pos, o: ps.map((x) => x.id) });
      else { swapped = list[best[1] - 1]; if (best[1] !== pos) push({ t: "swap", x: cur.id, i: swapped.id, a: best[1], f: pos, o: ps.map((x) => x.id) }); }
      if (swapped) ps = ps.map((c, i) => (i === worst[1] ? swapped! : c));
    }
  }
  const a = outAff(p, ps), ids = ps.map((x) => x.id);
  let touched = false;
  const fav = ps.map((c) => [aff(p, c), c] as const).sort((x, y) => y[0] - x[0])[0];
  if (fav[0] >= 0.55 && rnd() < 0.4) { push({ t: "tap_product", p: fav[1].id, o: ids, tg }); touched = true; if (rnd() < 0.5) push({ t: "like", p: fav[1].id, o: ids, tg }); if (rnd() < 0.2) push({ t: "view_product_click", p: fav[1].id, o: ids }); }
  if (a >= 0.55 && rnd() < 0.5) { push({ t: "outfit_up", o: ids, tg }); touched = true; }
  else if (a < 0.2 && rnd() < 0.25) { push({ t: "outfit_down", o: ids, tg }); touched = true; }
  const dwell = a >= 0.55 ? 6000 + rnd() * 6000 : a >= 0.35 ? 2000 + rnd() * 3000 : 300 + rnd() * 600;
  push({ t: "dwell_ms", o: ids, d: dwell, tg });
  if (swapped) push({ t: "keep", p: swapped.id, o: ids, b: touched || dwell >= 8000 ? 2 : 1 });
  if (dwell < 1000 && !touched) push({ t: "scroll_past", o: ids, tg });
}

const EVAL_PAGES = Number(process.env.EVAL_PAGES ?? 20);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
/** 60 evaluation outfits with the taste frozen (copies of ban / session, no learning) */
function evaluate(cat: Catalogue, g: "women" | "men", p: P | null, d: Dev, seed: number) {
  const e: Dev = { taste: d.taste, outbox: [], ban: new BanState([...d.ban.ids]), session: newSession(), n: d.n };
  const rnd = makeRnd(seed); const outs: ComposedOutfit[] = []; const ms: number[] = []; let thin: string[] = []; let personalized = false;
  for (let k = 0; k < EVAL_PAGES; k++) { const r = page(cat, g, e, rnd, false); outs.push(...r.outs); ms.push(r.ms); const st = compose(cat, { gender: g, taste: r.taste }, new BanState(), 1, newSession(), makeRnd(seed + k)).stats; thin = st.thin ?? thin; personalized = !!st.personalized; }
  const affs = p ? outs.map((o) => outAff(p, o.ids.map((id) => cat.byId.get(id)!))) : [];
  const share = (f: (i: number) => boolean) => (100 * outs.filter((_, i) => f(i)).length / outs.length).toFixed(0) + "%";
  const styles = new Map<string, number>(); outs.forEach((o) => styles.set(o.style, (styles.get(o.style) ?? 0) + 1));
  const topStyle = [...styles].sort((a, b) => b[1] - a[1])[0];
  const seen = new Map<number, number>(); let repeats = 0; for (const o of outs) for (const id of o.ids) { if (seen.has(id)) repeats++; seen.set(id, 1); }
  const tagShare = (f: (t: ReturnType<typeof outfitTags>) => string) => { const m = new Map<string, number>(); for (const o of outs) { const k = f(outfitTags(cat, { pieces: o.ids.map((id) => cat.byId.get(id)!), accs: [], bucket: o.bucket })); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(100 * v / outs.length)}%`).join(", "); };
  const buckets: Record<string, number> = {}; outs.forEach((o) => { buckets[o.bucket] = (buckets[o.bucket] ?? 0) + 1; });
  return {
    onInMatch: p ? (() => { const m = outs.map((o, i) => [o, affs[i]] as const).filter(([o]) => o.bucket === "match"); return m.length ? `${Math.round(100 * m.filter(([, a]) => a >= 0.5).length / m.length)}% of ${m.length}` : "-"; })() : "-",
    personalized, on: p ? share((i) => affs[i] >= 0.5) : "-", near: p ? share((i) => affs[i] >= 0.3 && affs[i] < 0.5) : "-", newish: p ? share((i) => affs[i] < 0.3 && outs[i].bucket !== "contrast") : "-",
    contrast: share((i) => outs[i].bucket === "contrast"), buckets, styles: styles.size, topStyle: `${topStyle[0]} ${Math.round(100 * topStyle[1] / outs.length)}%`,
    unique: { top: new Set(outs.map((o) => o.ids[0])).size, shoes: new Set(outs.map((o) => o.ids[o.ids.length - 1])).size }, repeats, score: `${q(outs.map((o) => o.score), 0.1).toFixed(3)}/${q(outs.map((o) => o.score), 0.5).toFixed(3)}`,
    season: tagShare((t) => t.season_primary), occasion: tagShare((t) => t.occasion), formality: tagShare((t) => t.formality_level), thin, msP50: q(ms, 0.5).toFixed(0), msP95: q(ms, 0.95).toFixed(0), outfits: outs.map((o) => ({ ids: o.ids, acc: o.acc.map((a) => a.id), bucket: o.bucket })),
  };
}

/** run a persona until `stops` events, evaluating at each stop; returns the device too */
export function run(cat: Catalogue, g: "women" | "men", p: P | null, stops: number[], seed = 7) {
  const d = newDev(), rnd = makeRnd(seed); const res: Record<number, ReturnType<typeof evaluate>> = {};
  res[0] = evaluate(cat, g, p, d, seed + 100);
  let idx = 0;
  while (idx < stops.length && p) {
    const r = page(cat, g, d, rnd);   // starter phase is approximated by neutral composer pages (the starter set is a curated neutral sample)
    for (let i = 0; i < r.outs.length; i++) react(cat, p, d, r.outs[i], r.alts[i], rnd);
    const n = (decodeTaste(d.taste)?.n ?? 0) + d.outbox.length;
    while (idx < stops.length && n >= stops[idx]) { const flush = page(cat, g, d, rnd); void flush; res[stops[idx]] = evaluate(cat, g, p, d, seed + 200 + idx); idx++; }
  }
  return { res, dev: d };
}

if (process.argv[1]?.includes("hybrid-sim")) (async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const args = process.argv.slice(2), only = args.includes("--gender") ? [args[args.indexOf("--gender") + 1]] : ["women", "men"];
  const dump: Record<string, unknown> = {};
  for (const g of only as ("women" | "men")[]) {
    console.log(`\n========== ${g}`);
    for (const p of [...PERSONAS, null]) {
      const { res, dev } = run(cat, g, p, p ? [20, 50, 100] : [], 7);
      const t = decodeTaste(dev.taste);
      console.log(`--- ${p?.name ?? "guest"}${t ? ` | taste after ${t.n} signals: top ${topStyles(t, "top", 3).map((x) => x[0]).join("/")}, bottom ${topStyles(t, "bottom", 3).map((x) => x[0]).join("/")}, shoes ${topStyles(t, "shoes", 2).map((x) => x[0]).join("/")} | blob ${dev.taste.length} B` : ""}`);
      for (const [k, r] of Object.entries(res)) console.log(`  after ${k.padStart(3)} events: ${r.personalized ? "personal" : "neutral "} on ${r.on} near ${r.near} new ${r.newish} contrast ${r.contrast} | styles ${r.styles}, top ${r.topStyle} | on-style inside the match bucket ${r.onInMatch} | unique tops ${r.unique.top}/${r.outfits.length} shoes ${r.unique.shoes}/${r.outfits.length} repeats ${r.repeats} | score p10/med ${r.score} | season ${r.season} | occasion ${r.occasion} | formality ${r.formality}${r.thin.length ? ` | THIN ${r.thin.join(" ")}` : ""} | ms p50 ${r.msP50} p95 ${r.msP95}`);
      dump[`${g}/${p?.name ?? "guest"}`] = { res: Object.fromEntries(Object.entries(res).map(([k, r]) => [k, { ...r }])), taste: dev.taste };
    }
    // test 1: someone who only likes one style still sees variety
    { const { res } = run(cat, g, ONE_STYLE, [100], 11); const r = res[100]; console.log(`TEST one style (classic only) after 100: on ${r.on} near ${r.near} new ${r.newish} contrast ${r.contrast} | styles ${r.styles}, top ${r.topStyle} | unique tops ${r.unique.top}/60`); }
    // test 2: unlike + swap-away reduce a style again
    {
      const p = PERSONAS[1]; const { dev } = run(cat, g, p, [100], 13);
      const t0 = decodeTaste(dev.taste)!; const street = cat.pieces.filter((c) => c.genders.includes(g) && c.slot === "top" && c.dom === "streetwear");
      const before = street.reduce((a, c) => a + tasteMatch(t0, c), 0) / street.length;
      const liked = street.slice(0, 40), sig: Signal[] = [];
      for (const c of liked) { sig.push({ t: "unlike", p: c.id, o: [c.id] }); sig.push({ t: "swap", x: c.id, i: street[(street.indexOf(c) + 50) % street.length].id, a: 1, f: 0 }); }
      const t1 = decodeTaste(dev.taste)!; applySignals(cat, t1, sig);
      const after = street.reduce((a, c) => a + tasteMatch(t1, c), 0) / street.length;
      const ev0 = evaluate(cat, g, p, dev, 99); const dev2 = { ...dev, taste: encodeTaste(t1) }; const ev1 = evaluate(cat, g, p, dev2, 99);
      console.log(`TEST unlike + swap-away (80 signals against streetwear tops): mean taste match of streetwear tops ${before.toFixed(3)} -> ${after.toFixed(3)}; persona on-style ${ev0.on} -> ${ev1.on}; top style ${ev0.topStyle} -> ${ev1.topStyle}`);
    }
    // test 3: a cleared taste behaves like a new device
    { const cleared = { taste: "", outbox: [], ban: new BanState(), session: newSession(), n: 0 }; const a = evaluate(cat, g, null, cleared, 5); const b = evaluate(cat, g, null, newDev(), 5); console.log(`TEST cleared taste: personalized ${a.personalized}, buckets ${JSON.stringify(a.buckets)} vs new device ${JSON.stringify(b.buckets)}, same outfits ${JSON.stringify(a.outfits.map((o) => o.ids)) === JSON.stringify(b.outfits.map((o) => o.ids))}`); }
  }
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null; if (out) writeFileSync(out, JSON.stringify(dump));
})();

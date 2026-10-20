// Background job: fills the precomputed outfit pool (table outfit_pool). Idempotent and re-runnable:
// rows are upserted by (gender, top, bottom, shoes); rows the latest run did not produce are set inactive.
// Usage: npx tsx scripts/build-outfits.ts [--dry] [--per-gender-min 0.6] [--out file.json]
import { writeFileSync } from "node:fs";
import { rpc } from "../src/ingest/gateway";
import { outfitStyle, scoreOutfit, toPiece, type Piece, type RawPiece } from "../src/outfits/score";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DRY = flag("dry");
const MIN_SCORE = Number(opt("min", "0.8"));
const CAP = { top: 4, bottom: 7, shoes: 6, full_body: 5 } as const; // max outfits per product (variety)
const K_PAIR = 10; // best bottoms per top (and tops per bottom) before choosing shoes
const SHOES_PER_PAIR = 3;

// deterministic PRNG so a re-run of the same data gives the same pool
let seed = Number(opt("seed", "7"));
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

interface Cand { key: string; ids: number[]; pieces: Piece[]; kind: "three" | "full"; score: number; style: string }

async function loadPieces(): Promise<Piece[]> {
  const out: Piece[] = [];
  let after = 0;
  for (;;) {
    const page = await rpc<RawPiece[]>("outfit_inputs", { p_after: after, p_limit: 1000 });
    if (!page.length) break;
    for (const r of page) { const p = toPiece(r); if (p) out.push(p); }
    after = page[page.length - 1].id;
  }
  return out;
}

function candidatesFor(g: "women" | "men", all: Piece[]): Cand[] {
  const by = (slot: string) => all.filter((p) => p.slot === slot && p.genders.includes(g));
  const T = by("top"), B = by("bottom"), S = by("shoes"), F = by("full_body");
  const map = new Map<string, Cand>();
  const add = (pieces: Piece[], kind: "three" | "full") => {
    const sc = scoreOutfit(pieces);
    if (!sc || sc.score < MIN_SCORE) return;
    const key = pieces.map((p) => p.id).join("|");
    const prev = map.get(key);
    if (!prev || prev.score < sc.score) map.set(key, { key, ids: pieces.map((p) => p.id), pieces, kind, score: sc.score, style: outfitStyle(pieces) });
  };
  const bestShoes = (pair: Piece[], n: number) => {
    const scored: [number, Piece][] = [];
    for (const s of S) { const sc = scoreOutfit([...pair, s]); if (sc) scored.push([sc.score + (rnd() - 0.5) * 0.04, s]); }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, n).map((x) => x[1]);
  };
  const pairScore = (a: Piece, b: Piece) => {
    let d = 0; for (let i = 0; i < a.vec.length; i++) d += a.vec[i] * b.vec[i];
    const sc = scoreOutfit([a, b]); // cheap proxy for the pair (shoes are chosen afterwards)
    return sc ? sc.score * 0.5 + d * 0.5 + (rnd() - 0.5) * 0.06 : -1;
  };
  // three-piece, anchored on every top and on every bottom (bottoms are the scarce slot)
  for (const t of T) {
    const best = B.map((b) => [pairScore(t, b), b] as [number, Piece]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, K_PAIR);
    for (const [, b] of best) for (const s of bestShoes([t, b], SHOES_PER_PAIR)) add([t, b, s], "three");
  }
  for (const b of B) {
    const best = T.map((t) => [pairScore(t, b), t] as [number, Piece]).filter((x) => x[0] > 0).sort((a, b2) => b2[0] - a[0]).slice(0, K_PAIR);
    for (const [, t] of best) for (const s of bestShoes([t, b], SHOES_PER_PAIR)) add([t, b, s], "three");
  }
  // full-body piece + shoes
  for (const f of F) for (const s of bestShoes([f], 6)) add([f, s], "full");
  return [...map.values()];
}

/** Pick by score with per-product caps. */
function select(cands: Cand[]): Cand[] {
  const used = new Map<number, number>();
  const out: Cand[] = [];
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    if (c.pieces.some((p) => (used.get(p.id) ?? 0) >= CAP[p.slot])) continue;
    for (const p of c.pieces) used.set(p.id, (used.get(p.id) ?? 0) + 1);
    out.push(c);
  }
  return out;
}

/** Order for the feed: weighted shuffle (high scores earlier, still varied) + no repeats of a product / style / store in a row. */
function order(sel: Cand[]): Cand[] {
  const keyed = sel.map((c) => ({ c, k: Math.pow(rnd(), 1 / Math.pow(c.score, 6)) })).sort((a, b) => b.k - a.k).map((x) => x.c);
  const usedIdx = new Array(keyed.length).fill(false);
  const out: Cand[] = [];
  const recentProducts: number[][] = [], recentStyles: string[] = [], recentStores: string[] = [];
  let first = 0;
  while (out.length < keyed.length) {
    while (usedIdx[first]) first++;
    const ok = (c: Cand, level: number) => {
      const ids = new Set(recentProducts.flat());
      if (c.ids.some((id) => ids.has(id))) return false;
      if (level >= 1) return true;
      if (recentStyles.slice(-2).every((s) => s === c.style) && recentStyles.length >= 2) return false;
      if (recentStores.slice(-1)[0] === c.pieces[0].store) return false;
      return true;
    };
    let pick = -1;
    for (const level of [0, 1, 2]) {
      for (let j = first, seen = 0; j < keyed.length && seen < 80; j++) {
        if (usedIdx[j]) continue;
        seen++;
        if (level === 2 || ok(keyed[j], level)) { pick = j; break; }
      }
      if (pick >= 0) break;
    }
    usedIdx[pick] = true;
    const c = keyed[pick];
    out.push(c);
    recentProducts.push(c.ids); if (recentProducts.length > 12) recentProducts.shift();
    recentStyles.push(c.style); if (recentStyles.length > 3) recentStyles.shift();
    recentStores.push(c.pieces[0].store); if (recentStores.length > 2) recentStores.shift();
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  const pieces = await loadPieces();
  console.log(`loaded ${pieces.length} feed-ready pieces`, JSON.stringify(Object.fromEntries(["top", "bottom", "shoes", "full_body"].map((s) => [s, pieces.filter((p) => p.slot === s).length]))));
  const run = DRY ? 0 : await rpc<number>("outfit_run_next");
  const dump: Record<string, unknown[]> = {};
  for (const g of ["women", "men"] as const) {
    const cands = candidatesFor(g, pieces);
    const sel = select(cands);
    const ordered = order(sel);
    const prodUsed = new Set(ordered.flatMap((c) => c.ids));
    const scores = ordered.map((c) => c.score).sort((a, b) => a - b);
    console.log(`[${g}] candidates ${cands.length} -> selected ${sel.length} (${ordered.filter((c) => c.kind === "full").length} full-body), products used ${prodUsed.size}, score min/median/max ${scores[0]?.toFixed(2)}/${scores[scores.length >> 1]?.toFixed(2)}/${scores[scores.length - 1]?.toFixed(2)} (${((Date.now() - t0) / 1000) | 0}s)`);
    dump[g] = ordered.map((c, i) => ({ order: i, kind: c.kind, score: +c.score.toFixed(3), style: c.style, ids: c.ids }));
    if (!DRY) {
      const rows = ordered.map((c, i) => ({ gender: g, kind: c.kind, top_id: c.ids[0], bottom_id: c.kind === "full" ? 0 : c.ids[1], shoes_id: c.ids[c.ids.length - 1], score: +c.score.toFixed(4), style_key: c.style, feed_order: i }));
      for (let i = 0; i < rows.length; i += 500) await rpc("outfit_pool_upsert", { p_run: run, p_items: rows.slice(i, i + 500) });
      console.log(`[${g}] retired from previous runs:`, await rpc("outfit_pool_finish", { p_run: run, p_gender: g }));
    }
  }
  if (opt("out", "")) writeFileSync(opt("out", ""), JSON.stringify(dump));
  console.log(`done in ${((Date.now() - t0) / 1000) | 0}s`);
})();

// Background job: fills the precomputed outfit pool (table outfit_pool). Idempotent and re-runnable:
// rows are upserted by (gender, top, bottom, shoes); rows the latest run did not produce are set inactive.
// --reserved-only: write ONLY the reserved outfits of thin styles (insert-only via outfit_pool_add; existing rows, labels and order untouched).
// Usage: npx tsx scripts/build-outfits.ts [--dry] [--per-gender-min 0.6] [--out file.json]
import { writeFileSync } from "node:fs";
import { rpc } from "../src/ingest/gateway";
import { toPiece, type Piece, type RawPiece } from "../src/outfits/score";
import { STYLE_KEYS } from "../src/classify/styles";
import { reservedFor, thinStyles, type ReservedCand } from "../src/outfits/reserved";
import { candidatesFor, makeRnd, order, select, type Cand } from "../src/outfits/pool-shared";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DRY = flag("dry");
const RESERVED_ONLY = flag("reserved-only");
const MIN_SCORE = Number(opt("min", "0.84"));

// deterministic PRNG so a re-run of the same data gives the same pool (generator and the pure parts live in src/outfits/pool-shared.ts)
const rnd = makeRnd(Number(opt("seed", "7")));

const raws = new Map<number, RawPiece>(); // raw style weights and names (the Piece vector is normalised)

async function loadPieces(): Promise<Piece[]> {
  const out: Piece[] = [];
  let after = 0;
  for (;;) {
    const page = await rpc<RawPiece[]>("outfit_inputs", { p_after: after, p_limit: 1000 });
    if (!page.length) break;
    for (const r of page) { const p = toPiece(r); if (p) { out.push(p); raws.set(r.id, r); } }
    after = page[page.length - 1].id;
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  const pieces = await loadPieces();
  console.log(`loaded ${pieces.length} feed-ready pieces`, JSON.stringify(Object.fromEntries(["top", "bottom", "shoes", "full_body"].map((s) => [s, pieces.filter((p) => p.slot === s).length]))));
  const run = DRY || RESERVED_ONLY ? 0 : await rpc<number>("outfit_run_next");
  const dump: Record<string, unknown[]> = {};
  for (const g of ["women", "men"] as const) {
    const cands = candidatesFor(pieces, g, rnd, MIN_SCORE);
    const sel = select(cands);
    const ordered = order(sel, rnd);
    const prodUsed = new Set(ordered.flatMap((c) => c.ids));
    const scores = ordered.map((c) => c.score).sort((a, b) => a - b);
    console.log(`[${g}] candidates ${cands.length} -> selected ${sel.length} (${ordered.filter((c) => c.kind === "full").length} full-body), products used ${prodUsed.size}, score min/median/max ${scores[0]?.toFixed(2)}/${scores[scores.length >> 1]?.toFixed(2)}/${scores[scores.length - 1]?.toFixed(2)} (${((Date.now() - t0) / 1000) | 0}s)`);
    // reserved outfits for thin styles (counts from this run's normal selection, not hardcoded); appended after the normal order, same run
    const counts: Record<string, number> = {};
    for (const c of ordered) counts[c.style] = (counts[c.style] ?? 0) + 1;
    const taken = new Set(ordered.map((c) => c.key));
    const reserved: ReservedCand[] = [];
    for (const style of thinStyles(counts, STYLE_KEYS)) {
      const w = (p: Piece) => raws.get(p.id)?.styles?.[style] ?? 0;
      const got = reservedFor(pieces, g, style, w, makeRnd(Number(opt("seed", "7")) * 1009 + STYLE_KEYS.indexOf(style as never) * 31 + (g === "men" ? 1 : 2)), MIN_SCORE, taken);
      for (const c of got) taken.add(c.key);
      reserved.push(...got);
      const nm = (id: number) => `${id} ${(raws.get(id)?.name ?? "").slice(0, 40)}`;
      console.log(`[${g}] reserved ${style}: before ${counts[style] ?? 0} +${got.length}, distinct pieces ${new Set(got.flatMap((c) => c.ids)).size}`);
      if (DRY && opt("samples", "").split(",").includes(style)) for (const c of got.slice(0, 3)) console.log("   ", c.ids.map(nm).join(" | "), c.score.toFixed(2));
    }
    const reservedOrdered = order(reserved, makeRnd(Number(opt("seed", "7")) + 5));
    ordered.push(...reservedOrdered);
    dump[g] = ordered.map((c, i) => ({ order: i, kind: c.kind, score: +c.score.toFixed(3), style: c.style, ids: c.ids }));
    if (RESERVED_ONLY && !DRY) {
      const rows = ordered.slice(ordered.length - reservedOrdered.length).map((c, i) => ({ gender: g, kind: c.kind, top_id: c.ids[0], bottom_id: c.kind === "full" ? 0 : c.ids[1], shoes_id: c.ids[c.ids.length - 1], score: +c.score.toFixed(4), style_key: c.style, feed_order: ordered.length - reservedOrdered.length + i }));
      let added = 0;
      for (let i = 0; i < rows.length; i += 500) added += await rpc<number>("outfit_pool_add", { p_items: rows.slice(i, i + 500) });
      console.log(`[${g}] reserved rows ${rows.length}, newly inserted ${added}`);
    } else if (!DRY) {
      const rows = ordered.map((c, i) => ({ gender: g, kind: c.kind, top_id: c.ids[0], bottom_id: c.kind === "full" ? 0 : c.ids[1], shoes_id: c.ids[c.ids.length - 1], score: +c.score.toFixed(4), style_key: c.style, feed_order: i }));
      for (let i = 0; i < rows.length; i += 500) await rpc("outfit_pool_upsert", { p_run: run, p_items: rows.slice(i, i + 500) });
      console.log(`[${g}] retired from previous runs:`, await rpc("outfit_pool_finish", { p_run: run, p_gender: g }));
    }
  }
  if (opt("out", "")) writeFileSync(opt("out", ""), JSON.stringify(dump));
  console.log(`done in ${((Date.now() - t0) / 1000) | 0}s`);
})();

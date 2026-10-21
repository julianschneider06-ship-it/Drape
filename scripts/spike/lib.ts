// Helpers for the composer spike scripts: load the catalogue (file cache next to the scripts' scratch dir, else snapshot_get), personas.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { STYLE_KEYS } from "../../src/classify/styles";
import { buildCatalogue, unpackSnapshot, type Catalogue } from "../../src/outfits/catalogue";
import { rpc } from "../../src/ingest/gateway";
import { newTaste, applyEvent, type Taste, type TasteEvent } from "../../src/outfits/taste";
import type { CatPiece } from "../../src/outfits/catalogue";

export async function loadCat(cacheFile = process.env.SNAP_CACHE ?? ""): Promise<{ cat: Catalogue; loadMs: number; blobKB: number }> {
  const t = performance.now(); let b64: string;
  if (cacheFile && existsSync(cacheFile)) b64 = readFileSync(cacheFile, "utf8");
  else { const r = await rpc<{ data: string }>("snapshot_get", { p_known_version: null }); b64 = r.data; if (cacheFile) writeFileSync(cacheFile, b64); }
  const cat = buildCatalogue(unpackSnapshot(b64));
  return { cat, loadMs: performance.now() - t, blobKB: b64.length / 1024 };
}

type W = Partial<Record<(typeof STYLE_KEYS)[number], number>>;
export interface Persona { name: string; gender: "women" | "men"; top: W; bottom: W; shoes: W; formality?: [number, number] }
/** persona affinity of a piece 0..1 from the per-slot style weights */
export const affinity = (p: Persona, c: CatPiece) => { const w = p[c.slot === "full_body" ? "top" : c.slot] as W; let s = 0, t = 0; STYLE_KEYS.forEach((k, i) => { const x = (w as Record<string, number>)[k] ?? 0; s += x * c.vec[i]; t += x * x; }); return t ? s / Math.sqrt(t) : 0; };
export const PERSONAS = (gender: "women" | "men"): Persona[] => [
  { name: "smart bottoms + relaxed tops", gender, top: { streetwear: 1, minimalism: 0.8, athleisure: 0.6, scandi: 0.6 }, bottom: { business_casual: 1, classic: 0.9, old_money: 0.8, quiet_luxury: 0.6 }, shoes: { classic: 0.8, minimalism: 0.6, business_casual: 0.7 } },
  { name: "streetwear", gender, top: { streetwear: 1, skater: 0.6, y2k: 0.4 }, bottom: { streetwear: 1, skater: 0.7, y2k: 0.4 }, shoes: { streetwear: 1, skater: 0.5, sporty: 0.4 } },
  { name: "old money", gender, top: { old_money: 1, preppy: 0.7, classic: 0.7, quiet_luxury: 0.6 }, bottom: { old_money: 1, classic: 0.8, preppy: 0.6, quiet_luxury: 0.6 }, shoes: { old_money: 1, classic: 0.8, preppy: 0.5 } },
  { name: "minimal / scandi", gender, top: { minimalism: 1, scandi: 0.9, quiet_luxury: 0.5 }, bottom: { minimalism: 1, scandi: 0.9, quiet_luxury: 0.5 }, shoes: { minimalism: 1, scandi: 0.8 } },
  { name: "sporty / gorpcore", gender, top: { gorpcore: 1, sporty: 0.8, athleisure: 0.7, techwear: 0.5 }, bottom: { gorpcore: 1, sporty: 0.8, athleisure: 0.7, techwear: 0.5 }, shoes: { gorpcore: 1, sporty: 0.8, athleisure: 0.6 } },
];
/** simulated event stream of a persona over composed outfits: outfit_up / like when the outfit matches, scroll_past / outfit_down when it does not */
export function simulateTaste(taste: Taste, persona: Persona, outs: { ps: CatPiece[] }[], rnd: () => number): { up: number; down: number; past: number } {
  const c = { up: 0, down: 0, past: 0 };
  for (const o of outs) {
    const a = o.ps.reduce((s, p) => s + affinity(persona, p), 0) / o.ps.length;
    if (a >= 0.55 && rnd() < 0.7) { applyEvent(taste, { type: "outfit_up", pieces: o.ps }); applyEvent(taste, { type: "dwell_ms", dwell_ms: 5000, pieces: o.ps }); if (rnd() < 0.5) applyEvent(taste, { type: "like", piece: o.ps[Math.floor(rnd() * o.ps.length)], pieces: o.ps }); c.up++; }
    else if (a < 0.25) { applyEvent(taste, rnd() < 0.15 ? { type: "outfit_down", pieces: o.ps } : { type: "scroll_past", pieces: o.ps }); c.past++; }
    else applyEvent(taste, { type: "dwell_ms", dwell_ms: 2000, pieces: o.ps });
  }
  return c;
}
export { newTaste };

// What the connection model learns from a simulated event stream (persona "smart bottoms + relaxed tops", men).
import { loadCat, PERSONAS, simulateTaste, newTaste } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { STYLE_KEYS } from "../../src/classify/styles";
import { tasteBytes } from "../../src/outfits/taste";
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE); const g = "men", persona = PERSONAS(g)[0]; const rnd = makeRnd(9), taste = newTaste(), ses = newSession(); let ban = new BanState(); let c = { up: 0, down: 0, past: 0 };
  for (let p = 0; p < 40; p++) { const r = compose(cat, { gender: g, taste: p < 8 ? null : taste }, ban, 6, ses, rnd); ban = r.ban; const s = simulateTaste(taste, persona, r.outfits.map((o) => ({ ps: o.ids.map((id) => cat.byId.get(id)!) })), rnd); c = { up: c.up + s.up, down: c.down + s.down, past: c.past + s.past }; }
  const D = STYLE_KEYS.length; const cells: [number, string][] = []; for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) cells.push([taste.tb[i * D + j], `${STYLE_KEYS[i]} (top) x ${STYLE_KEYS[j]} (bottom)`]);
  console.log("events: outfit_up", c.up, "scroll_past/outfit_down", c.past, "| device taste size ~", (tasteBytes(taste) / 1024).toFixed(1), "KB");
  const top = (m: Float32Array) => [...m].map((v, k) => [v, k] as const).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([v, k]) => `${STYLE_KEYS[Math.floor(k / D)]}x${STYLE_KEYS[k % D]} ${v.toFixed(1)}`).join(", ");
  console.log("strongest top x bottom connections:", top(taste.tb)); console.log("strongest bottom x shoes connections:", top(taste.bs));
  console.log("formality gap bins (0 = same level ... 4 = very different):", Array.from(taste.fgap, (v) => v.toFixed(1)).join(" "));
  for (const s of ["top", "bottom", "shoes"] as const) console.log(`${s} style vector top 3:`, [...taste.styles[s]].map((v, k) => [v, k] as const).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([v, k]) => `${STYLE_KEYS[k]} ${v.toFixed(1)}`).join(", "));
  console.log("top colours:", Object.entries(taste.colours).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", "), "| formality mean", taste.formality.toFixed(2), "boldness", taste.boldness.toFixed(2)); void cells;
})();

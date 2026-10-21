// Readable summary of a taste (debug page /taste, reports). Server only.
import { STYLE_KEYS } from "@/classify/styles";
import { mixFor, SIGNAL, TASTE } from "./config";
import { topStyles, type Taste } from "@/outfits/taste";

const D = STYLE_KEYS.length;
const top = (d: Record<string, number>, n = 6) => Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(2)] as [string, number]);
const bottom = (d: Record<string, number>, n = 3) => Object.entries(d).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(2)] as [string, number]);
function strongest(m: Float32Array, n = 5) {
  const out: [string, number][] = [];
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) out.push([`${STYLE_KEYS[i]} + ${STYLE_KEYS[j]}`, m[i * D + j]]);
  return out.sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(2)] as [string, number]);
}
export function summarize(t: Taste) {
  const tagFam = (k: string) => top(Object.fromEntries(Object.entries(t.tags).filter(([x]) => x.startsWith(`${k}:`)).map(([x, v]) => [x.slice(k.length + 1), v])), 5);
  return {
    events: t.n, personalized: t.n >= TASTE.personalizeFrom, personalizeFrom: TASTE.personalizeFrom, counts: t.counts, updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null, lastEventId: t.lastEventId,
    styles: { top: topStyles(t, "top").map(([k, v]) => [k, +v.toFixed(2)]), bottom: topStyles(t, "bottom").map(([k, v]) => [k, +v.toFixed(2)]), shoes: topStyles(t, "shoes").map(([k, v]) => [k, +v.toFixed(2)]) },
    attributes: { colours: top(t.colours), coloursLess: bottom(t.colours), categories: top(t.categories), categoriesLess: bottom(t.categories), silhouettes: top(t.silhouettes, 4), formality: +t.formality.toFixed(2), boldness: +t.boldness.toFixed(2) },
    tags: { season: tagFam("se"), occasion: tagFam("oc"), palette: tagFam("pk"), silhouette: tagFam("si"), formality: tagFam("fo"), weather: tagFam("w"), contrast: tagFam("ct") },
    connections: { topBottom: strongest(t.tb), bottomShoes: strongest(t.bs), formalityGap: Array.from(t.fgap, (v) => +v.toFixed(2)) },
    mix: mixFor(t.n), weights: SIGNAL,
  };
}

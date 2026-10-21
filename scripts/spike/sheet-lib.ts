// QA contact sheet from catalogue cutouts: each outfit = pieces stacked (top, bottom, shoes or full body + shoes), label under it.
import sharp from "sharp";
import type { Catalogue } from "../../src/outfits/catalogue";

const cache = new Map<string, Buffer>();
async function tile(url: string, w: number, h: number): Promise<Buffer> {
  const k = `${url}|${w}x${h}`; if (cache.has(k)) return cache.get(k)!;
  const r = await fetch(url); const buf = await sharp(Buffer.from(await r.arrayBuffer())).flatten({ background: "#fff" }).resize(w, h, { fit: "contain", background: "#fff" }).png().toBuffer();
  cache.set(k, buf); return buf;
}
export interface SheetItem { label: string; ids: number[]; acc?: number[] }
export async function renderSheet(cat: Catalogue, items: SheetItem[], cols: number, out: string, cell = { w: 150, h: 130, label: 54 }) {
  const rows = Math.ceil(items.length / cols);
  const maxN = Math.max(...items.map((i) => i.ids.length)), W = cell.w * cols, rowH = cell.h * (maxN > 1 ? 3 : 1) + cell.label, comps: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], x = (i % cols) * cell.w, y0 = Math.floor(i / cols) * rowH;
    for (let j = 0; j < it.ids.length; j++) {
      const p = cat.byId.get(it.ids[j]); const url = (p?.card as { cutout?: string } | undefined)?.cutout; if (!url) continue;
      comps.push({ input: await tile(url, cell.w - 6, it.ids.length === 2 ? Math.round(cell.h * 1.5) : cell.h - 4), left: x + 3, top: y0 + (it.ids.length === 2 ? j * Math.round(cell.h * 1.5) : j * cell.h) + 2 });
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cell.label}"><text x="4" y="12" font-size="10" font-family="sans-serif" fill="#111">${it.label.split("\n").map((l, k) => `<tspan x="4" dy="${k ? 12 : 0}">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 28)}</tspan>`).join("")}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: x, top: y0 + cell.h * (maxN > 1 ? 3 : 1) });
  }
  await sharp({ create: { width: W, height: rows * rowH, channels: 3, background: "#fff" } }).composite(comps).png().toFile(out);
}

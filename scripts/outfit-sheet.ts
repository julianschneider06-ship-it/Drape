// QA tool: contact sheet of outfits (3 stacked pieces each). Usage: npx tsx scripts/outfit-sheet.ts <pool.json> <selection.json> <gender> <out.png>
// selection.json = {women:[{ids:[..],score,style,kind}], men:[...]}
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { rpc } from "../src/ingest/gateway";

const [poolFile, selFile, gender, out] = process.argv.slice(2);
void poolFile;
const sel = JSON.parse(readFileSync(selFile, "utf8"))[gender] as { ids: number[]; score: number; style: string; kind: string }[];
const W = 150, H = 150, LABEL = 34;

type Card = { id: number; brand: string; name: string; image: string; whiten: number | null; store: string };
async function tile(c: Card, w: number, h: number) {
  const r = await fetch(c.image + (c.image.includes("?") ? "&" : "?") + "width=400");
  const img = await sharp(Buffer.from(await r.arrayBuffer())).flatten({ background: "#fff" })
    .modulate({ brightness: c.whiten ?? 1 }).resize(w, h, { fit: "contain", background: "#fff" }).png().toBuffer();
  return img;
}

(async () => {
  const ids = [...new Set(sel.flatMap((o) => o.ids))];
  const cards = new Map<number, Card>();
  for (const id of ids) { const c = await rpc<Card>("product_card", { p_id: id, p_stock: false }); if (c) cards.set(id, c); }
  const colH = H * 3 + LABEL;
  const comps: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < sel.length; i++) {
    const o = sel[i]; const x = i * W;
    let y = 0;
    for (let j = 0; j < o.ids.length; j++) {
      const c = cards.get(o.ids[j]); if (!c) continue;
      const tall = o.kind === "full" && j === 0; // full-body piece takes top + bottom positions
      const h = tall ? H * 2 : H;
      comps.push({ input: await tile(c, W, h), left: x, top: y }); y += h;
    }
    const txt = `${o.score.toFixed(2)} ${o.style} | ${o.ids.map((id) => (cards.get(id)?.store ?? "?").slice(0, 7)).join(",")}`.replace(/&/g, "&amp;");
    comps.push({ input: Buffer.from(`<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><text x="3" y="13" font-size="10" font-family="DejaVu Sans, sans-serif" fill="#000">#${i + 1} ${txt.slice(0, 26)}</text><text x="3" y="27" font-size="9" font-family="DejaVu Sans, sans-serif" fill="#555">${txt.slice(26, 60)}</text></svg>`), left: x, top: H * 3 });
  }
  await sharp({ create: { width: W * sel.length, height: colH, channels: 3, background: "#fff" } }).composite(comps).png().toFile(out);
  console.log("sheet", out);
})();

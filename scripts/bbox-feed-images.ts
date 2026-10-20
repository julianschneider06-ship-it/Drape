// Content bounding box of every feed image (so the feed can crop away shop whitespace and show products at a consistent size).
// Idempotent: only products whose feed image has no bbox yet. Run after classification / when feed images change.
import sharp from "sharp";
import { rpc } from "../src/ingest/gateway";

interface Todo { id: number; url: string; bg: string | null }
const CONCURRENCY = 24;

async function bbox(url: string) {
  const res = await fetch(url + (url.includes("?") ? "&" : "?") + "width=400", { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const { data, info } = await sharp(buf).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // backdrop colour = median of the outer 3% ring
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03)), border: number[][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < ring || y < ring || x >= w - ring || y >= h - ring) { const i = (y * w + x) * 3; border.push([data[i], data[i + 1], data[i + 2]]); }
  const med = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (Math.max(Math.abs(data[i] - med[0]), Math.abs(data[i + 1] - med[1]), Math.abs(data[i + 2] - med[2])) > 28) { rows[y]++; cols[x]++; }
  }
  const rMin = Math.max(1, Math.round(w * 0.004)), cMin = Math.max(1, Math.round(h * 0.004)); // ignore specks
  const y0 = rows.findIndex((n) => n >= rMin), y1 = rows.length - 1 - [...rows].reverse().findIndex((n) => n >= rMin);
  const x0 = cols.findIndex((n) => n >= cMin), x1 = cols.length - 1 - [...cols].reverse().findIndex((n) => n >= cMin);
  if (y0 < 0 || x0 < 0 || x1 <= x0 || y1 <= y0) return null;
  const pad = 0.025; // breathing room
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  return { x0: cl(x0 / w - pad), y0: cl(y0 / h - pad), x1: cl((x1 + 1) / w + pad), y1: cl((y1 + 1) / h + pad), aspect: (meta.width ?? w) / (meta.height ?? h) };
}

(async () => {
  let after = 0, done = 0, failed = 0;
  const t0 = Date.now();
  for (;;) {
    const todo = await rpc<Todo[]>("bbox_todo", { p_after: after, p_limit: 240 });
    if (!todo.length) break;
    const out: object[] = [];
    let i = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (i < todo.length) {
        const t = todo[i++];
        try { const b = await bbox(t.url); if (b) out.push({ id: t.id, url: t.url, ...b }); else failed++; } catch { failed++; }
      }
    }));
    if (out.length) await rpc("bbox_apply", { p_items: out });
    done += out.length; after = todo[todo.length - 1].id;
    console.log(`bbox ${done} (failed ${failed}) ${((Date.now() - t0) / 1000) | 0}s`);
  }
  console.log("done", { done, failed });
})();

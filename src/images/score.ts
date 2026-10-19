// Free image pre-selection signals (no AI): filename/alt hints, position, aspect ratio and a pixel check.
import sharp from "sharp";

const clamp = (x: number) => Math.max(0, Math.min(1, x));

export interface ImageIn { id: number; url: string; pos: number; alt: string | null; width: number | null; height: number | null }
export interface ImageScore { id: number; bg_whiteness: number | null; object_fill: number | null; view_hint: string; score: number; feed_rank?: number }

const GOOD = /\b(front|flat|still|packshot|pack[-_ ]?shot|pdp|ghost|cutout|hero|studio|ecom|e-?comm|product[-_ ]?shot)\b|[-_ ](f|ff)\.(jpe?g|png|webp)/i;
const MODEL = /\b(model|look|lifestyle|worn|wearing|on[-_ ]?model|campaign|editorial|street|outfit|styled|style)\b/i;
const BACK = /\b(back|rear|side|detail|close[-_ ]?up|closeup|zoom|texture|swatch|label|pocket|collar|sleeve|inside|sole)\b/i;

export function viewHint(url: string, alt: string | null): string {
  const t = `${decodeURIComponent(url.split("?")[0].split("/").pop() ?? "")} ${alt ?? ""}`.toLowerCase().replace(/[_.]/g, " ");
  if (/\b(detail|close ?up|closeup|zoom|texture|swatch|label)\b/.test(t)) return "detail";
  if (/\b(back|rear)\b/.test(t)) return "back";
  if (MODEL.test(t)) return "model";
  if (/\b(flat|ghost|still|packshot|pack shot|cutout)\b/.test(t)) return "flat";
  if (/\bfront\b/.test(t)) return "front";
  return "unknown";
}

/**
 * Pixel check on a ~200px thumbnail via the shop CDN width parameter.
 * bg = how plain AND bright the border is (white studio = 1, light grey backdrop ~0.6, busy scene = low).
 * fill = share of the frame covered by the bounding box of everything that differs from the border colour.
 */
export async function pixelStats(url: string): Promise<{ bg: number; fill: number } | null> {
  const thumb = url + (url.includes("?") ? "&" : "?") + "width=200";
  const res = await fetch(thumb, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .flatten({ background: "#ffffff" }).resize(200, 200, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.04)); // outer 4% of the frame
  const border: number[][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < ring || y < ring || x >= w - ring || y >= h - ring) { const i = (y * w + x) * 3; border.push([data[i], data[i + 1], data[i + 2]]); }
  }
  const med = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const dist = (r: number, g: number, b: number) => Math.max(Math.abs(r - med[0]), Math.abs(g - med[1]), Math.abs(b - med[2]));
  const plain = border.filter((p) => dist(p[0], p[1], p[2]) <= 12).length / border.length;
  const brightness = clamp((Math.min(...med) - 190) / 60); // 250+ = 1, 220 = 0.5, 190 or darker = 0
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (dist(data[i], data[i + 1], data[i + 2]) > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const fill = maxX < 0 ? 0 : ((maxX - minX + 1) * (maxY - minY + 1)) / (w * h);
  return { bg: plain * brightness, fill };
}


export function combine(img: ImageIn, px: { bg: number; fill: number } | null): ImageScore {
  const name = `${decodeURIComponent(img.url.split("?")[0].split("/").pop() ?? "")} ${img.alt ?? ""}`;
  const hint = viewHint(img.url, img.alt);
  let hintScore = 0.5;
  if (GOOD.test(name)) hintScore += 0.25;
  if (hint === "flat" || hint === "front") hintScore += 0.15;
  if (MODEL.test(name) || hint === "model") hintScore -= 0.35;
  if (BACK.test(name) || hint === "back" || hint === "detail") hintScore -= 0.4;
  hintScore = clamp(hintScore);
  const bg = px?.bg ?? 0;
  const fill = px?.fill ?? 0;
  // Product should fill a decent part of the frame, but not be cropped: best between 0.45 and 0.9.
  const fillScore = fill < 0.45 ? fill / 0.45 : fill > 0.9 ? 1 - (fill - 0.9) * 3 : 1;
  const posScore = clamp(1 - (img.pos - 1) * 0.12);
  const ratio = img.width && img.height ? img.width / img.height : null;
  const aspectScore = ratio == null ? 0.5 : ratio >= 0.7 && ratio <= 1.1 ? 1 : ratio >= 0.55 && ratio <= 1.4 ? 0.6 : 0.2;
  const score = 0.35 * bg + 0.2 * clamp(fillScore) + 0.25 * hintScore + 0.1 * posScore + 0.1 * aspectScore;
  return { id: img.id, bg_whiteness: px ? +bg.toFixed(3) : null, object_fill: px ? +fill.toFixed(3) : null, view_hint: hint, score: +score.toFixed(4) };
}

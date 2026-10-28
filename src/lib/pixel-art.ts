// Shared by the pixel figure and the pixel decorations: a grid of single characters -> merged SVG rects (flat colours, no outlines).
export interface PixelRect { x: number; y: number; w: number; h: number; fill: string }

/** `rows` = one string per row, `colors` maps a character to a fill (characters without a fill are empty). Horizontal runs of one colour become one rect. */
export function pixelRects(rows: readonly string[], colors: Readonly<Record<string, string>>): PixelRect[] {
  const out: PixelRect[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const fill = colors[row[x]];
      if (!fill) { x++; continue; }
      let n = 1;
      while (x + n < row.length && colors[row[x + n]] === fill) n++;
      out.push({ x, y, w: n, h: 1, fill });
      x += n;
    }
  });
  return out;
}

export const rectsMarkup = (rects: readonly PixelRect[]): string => rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`).join("");

/** small bounded cache for generated markup (keys are short strings built from the inputs) */
export function memoMarkup(max = 256) {
  const m = new Map<string, string>();
  return (key: string, make: () => string): string => {
    let v = m.get(key);
    if (v === undefined) { if (m.size >= max) m.clear(); v = make(); m.set(key, v); }
    return v;
  };
}

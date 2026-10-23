import { LIKES_GRID_COLUMNS, LIKES_GRID_DEFAULT } from "@/config/likes-grid";

export type Cols = number;

/** Stored value -> column count; anything not in the cycle falls back to the default. */
export function parseCols(raw: string | null | undefined): Cols {
  const n = Number(raw);
  return (LIKES_GRID_COLUMNS as readonly number[]).includes(n) ? n : LIKES_GRID_DEFAULT;
}

/** The column count after `cols` in the cycle (2 -> 3 -> 4 -> 2). */
export function nextCols(cols: Cols): Cols {
  const i = (LIKES_GRID_COLUMNS as readonly number[]).indexOf(cols);
  return LIKES_GRID_COLUMNS[(i + 1) % LIKES_GRID_COLUMNS.length] ?? LIKES_GRID_DEFAULT;
}

/** Which text fields a grid cell shows: 2 = all, 3 = brand + price, 4 = price only (image always). The shop link lives only in the product sheet. */
export function fieldsFor(cols: Cols): { brand: boolean; name: boolean; oldPrice: boolean } {
  return { brand: cols <= 3, name: cols <= 2, oldPrice: cols <= 3 };
}

/** The grid button shows the CURRENT layout: icon columns = the active mode (anything invalid = default). */
export function gridIconCols(cols: Cols): Cols { return (LIKES_GRID_COLUMNS as readonly number[]).includes(cols) ? cols : LIKES_GRID_DEFAULT; }
export function gridLabel(cols: Cols): string { const n = gridIconCols(cols); return `Grid density, ${n} columns`; }

// Pure logic of the custom accessory layout in My Outfits (no I/O): clamping of position and size, drag vs tap, applying it to a laid-out outfit.
// y = vertical centre of the slot as a fraction of the area height (survives other screen sizes), s = size relative to the default slot, z = touch order.
// The horizontal position never changes: the right edge stays where the layout put it.
import { MY_OUTFITS_ACC_DRAG_PX, MY_OUTFITS_ACC_MAX_SCALE, MY_OUTFITS_ACC_MIN_SCALE, MY_OUTFITS_ACC_Z_BASE } from "@/config/my-outfits";
import type { Placed, Rect } from "@/lib/layout/engine";

export interface AccLayout { y: number; s: number; z?: number }

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** the largest allowed scale for this default rect: the config max, but never bigger than the area height or the room to the left of the right edge */
export function maxScaleFor(def: Rect, W: number, H: number): number {
  return Math.max(MY_OUTFITS_ACC_MIN_SCALE, Math.min(MY_OUTFITS_ACC_MAX_SCALE, H / def.h, (def.x + def.w) / def.w, W / def.w));
}
export const clampScale = (s: number, def: Rect, W: number, H: number) => clamp(fin(s) ? s : 1, MY_OUTFITS_ACC_MIN_SCALE, maxScaleFor(def, W, H));
/** keep the slot fully inside the area vertically (centre as fraction of H) */
export function clampCenter(y: number, h: number, H: number): number {
  const half = h / 2 / H;
  return half >= 0.5 ? 0.5 : clamp(fin(y) ? y : 0.5, half, 1 - half);
}
/** the default (layout) state of a slot */
export const defaultAccLayout = (def: Rect, H: number): AccLayout => ({ y: (def.y + def.h / 2) / H, s: 1 });
/** the slot rectangle for a layout entry: same aspect ratio, right edge kept, centred on y, fully inside the area */
export function accRect(def: Rect, c: AccLayout, W: number, H: number): Rect {
  const s = clampScale(c.s, def, W, H), w = def.w * s, h = def.h * s;
  return { x: def.x + def.w - w, y: clampCenter(c.y, h, H) * H - h / 2, w, h };
}
/** drag the slot by dy pixels (vertical only) */
export function moveLayout(def: Rect, start: AccLayout, dy: number, W: number, H: number): AccLayout {
  const r = accRect(def, start, W, H);
  return { ...start, y: clampCenter((r.y + r.h / 2 + dy) / H, r.h, H) };
}
/** drag the bottom-left corner by (dx, dy) pixels: the top-right corner stays fixed, the aspect ratio is kept; moving down / left grows it */
export function resizeLayout(def: Rect, start: AccLayout, dx: number, dy: number, W: number, H: number): AccLayout {
  const r0 = accRect(def, start, W, H), s0 = r0.w / def.w;
  const ds = (-dx * def.w + dy * def.h) / (def.w * def.w + def.h * def.h);
  const s = clampScale(s0 + ds, def, W, H), h = def.h * s;
  const top = Math.min(r0.y, H - h);   // fixed top edge, pushed up only if the bigger slot would leave the area
  return { ...start, s, y: clampCenter((top + h / 2) / H, h, H) };
}
/** movement under the threshold is a tap */
export const isDrag = (dx: number, dy: number, threshold = MY_OUTFITS_ACC_DRAG_PX) => Math.hypot(dx, dy) > threshold;
/** z of the slot touched next: above every slot touched before */
export const nextZ = (list: (AccLayout | null | undefined)[]) => list.reduce((m, c) => Math.max(m, c?.z ?? 0), 0) + 1;

/** read stored entries (alignment with the accessory list is the caller's job): anything invalid becomes null = default layout; values are clamped */
export function parseAccLayout(v: unknown): AccLayout | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!fin(o.y) || !fin(o.s)) return null;
  const c: AccLayout = { y: clamp(o.y, 0, 1), s: clamp(o.s, MY_OUTFITS_ACC_MIN_SCALE, MY_OUTFITS_ACC_MAX_SCALE) };
  if (fin(o.z) && Number.isInteger(o.z) && o.z > 0 && o.z < 1e6) c.z = o.z;
  return c;
}

/** apply the custom entries to a laid-out outfit: `layouts[i]` belongs to accessory slot acc{i+1}; pieces without an entry stay as the layout put them */
export function applyAccLayout(pieces: Placed[], layouts: readonly (AccLayout | null | undefined)[] | undefined, W: number, H: number): Placed[] {
  if (!layouts || !layouts.some(Boolean)) return pieces;
  return pieces.map((p) => {
    if (!p.slot.startsWith("acc")) return p;
    const c = layouts[Number(p.slot.slice(3)) - 1];
    return c ? { ...p, rect: accRect(p.rect, c, W, H), z: c.z ? MY_OUTFITS_ACC_Z_BASE + c.z : p.z } : p;
  });
}

/** the editor's accessory behaviour: "custom" = frame, resize handle, vertical move (switch on); "plain" = the Prompt 60 look, tap opens the picker, no gestures (switch off) */
export const accSlotMode = (customize: boolean): "custom" | "plain" => (customize ? "custom" : "plain");
/** the stored layouts that apply right now: none while the switch is off. They stay in local storage and in the saved outfit, untouched. */
export function activeAccLayouts<T>(customize: boolean, layouts: T): T | undefined {
  return customize ? layouts : undefined;
}

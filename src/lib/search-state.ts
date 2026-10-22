// State handling of the Search tab (pure, so it can be tested): what the bottom-bar tap does, the Clear button, and the selection kept per session.
import type { Direction, SearchExtra, SearchItem, SearchSeason } from "@/config/search";
import type { StyleFamily } from "@/config/style-families";
import { parseExtra, parseFamily, parseItem, parseSeason } from "@/lib/search";

export interface Sel { item: SearchItem | null; family: StyleFamily | null; season: SearchSeason | null; extra: SearchExtra | null }
export type Phase = "config" | "loading" | "results" | "error";
export const EMPTY_SEL: Sel = { item: null, family: null, season: null, extra: null };
export const hasSel = (s: Sel) => !!(s.item || s.family || s.season || s.extra);

/** "Search" tapped in the bottom bar while already in Search: results -> configurator (selection pre-filled); configurator with an active search -> back to the
 *  results (a change that was not submitted is dropped); no active search -> nothing changes; a running search is left alone. */
export function tapAction(phase: Phase, hasResults: boolean): "open-config" | "back-to-results" | "none" {
  if (phase === "results") return "open-config";
  if (phase === "loading") return "none";
  return hasResults ? "back-to-results" : "none";
}

/** Clear is offered when anything beyond the default direction (the feed's) is selected, or results are stored */
export const canClear = (dir: Direction, feedDir: Direction, sel: Sel, hasResults: boolean) => hasResults || dir !== feedDir || hasSel(sel);
/** a fresh configurator: direction back to the feed's, nothing else selected */
export const freshState = (feedDir: Direction): { dir: Direction; sel: Sel } => ({ dir: feedDir, sel: { ...EMPTY_SEL } });

/** the selection kept in sessionStorage (selection only, never results, never server-side); anything unreadable gives null */
export const encodeState = (dir: Direction, sel: Sel) => JSON.stringify({ d: dir, s: sel });
export function decodeState(raw: string | null | undefined): { dir: Direction; sel: Sel } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { d?: unknown; s?: Record<string, unknown> };
    if (j.d !== "women" && j.d !== "men") return null;
    const s = j.s ?? {};
    return { dir: j.d, sel: { item: parseItem(s.item), family: parseFamily(s.family), season: parseSeason(s.season), extra: parseExtra(s.extra) } };
  } catch { return null; }
}

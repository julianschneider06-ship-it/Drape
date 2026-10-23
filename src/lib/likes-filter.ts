import { LIKES_FILTER_FALLBACK, LIKES_FILTER_GROUPS, type LikesGroup } from "@/config/likes-filter";

export type LikesFilter = "all" | LikesGroup;

export function groupOf(slot: string | null | undefined): LikesGroup {
  return LIKES_FILTER_GROUPS.find((g) => slot != null && g.slots.includes(slot))?.id ?? LIKES_FILTER_FALLBACK;
}

/** chips to show: All always, a group only when at least one listed product belongs to it */
export function chipsFor(items: { slot: string }[]): { id: LikesFilter; label: string }[] {
  const have = new Set(items.map((c) => groupOf(c.slot)));
  return [{ id: "all", label: "All" }, ...LIKES_FILTER_GROUPS.filter((g) => have.has(g.id)).map((g) => ({ id: g.id as LikesFilter, label: g.label }))];
}

/** the filter actually applied: falls back to All when its group has no products left */
export function effectiveFilter(filter: LikesFilter, items: { slot: string }[]): LikesFilter {
  return chipsFor(items).some((c) => c.id === filter) ? filter : "all";
}

export function applyFilter<T extends { slot: string }>(items: T[], filter: LikesFilter): T[] {
  return filter === "all" ? items : items.filter((c) => groupOf(c.slot) === filter);
}

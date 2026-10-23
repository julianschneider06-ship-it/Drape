import type { FeedCard } from "@/lib/types";

/** What a price line shows: the current price, plus the struck-through original price only when the product is on sale (compare_at above price) and the sale marker is on. Missing prices are never invented. */
export function priceDisplay(c: Pick<FeedCard, "price_cents" | "compare_at_cents">, saleOn: boolean): { now: number | null; was: number | null } {
  const now = c.price_cents ?? null;
  const onSale = now !== null && !!c.compare_at_cents && c.compare_at_cents > now;
  return { now, was: saleOn && onSale ? c.compare_at_cents : null };
}

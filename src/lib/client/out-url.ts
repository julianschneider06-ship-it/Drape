// Every link to a shop goes through our redirect (click log + affiliate). The shop URL itself never appears in the page.
import type { Surface } from "../out";
export function outHref(productId: number, surface: Surface, feedVariant?: "base" | "dynamic" | "hybrid"): string {
  const q = new URLSearchParams({ s: surface });
  if (feedVariant) q.set("fv", feedVariant);
  try { const src = new URLSearchParams(location.search).get("src"); if (src) q.set("src", src); } catch { /* server render */ }
  return `/out/${productId}?${q}`;
}

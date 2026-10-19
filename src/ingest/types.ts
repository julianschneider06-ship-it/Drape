// Common product schema every source adapter normalizes into.
export type Gender = "women" | "men" | "unisex" | "kids";
export type Category = "tops" | "bottoms" | "outerwear" | "dresses" | "shoes" | "accessories" | "other";
export type Availability = "in_stock" | "out_of_stock" | "unknown";

export interface NormalizedProduct {
  externalId: string; // stable id inside the source; the upsert key together with the source
  url: string;
  brand: string;
  name: string;
  gender: Gender | null;
  category: Category;
  subcategory: string | null; // source's own product type, kept for later classification
  colour: string | null;
  images: { url: string; width?: number; height?: number }[];
  priceCents: number | null;
  compareAtCents: number | null;
  currency: string | null;
  availability: Availability;
}

export interface RawItem {
  externalId: string;
  payload: unknown; // untouched source data, stored so we can re-normalize without re-crawling
}

export interface Page {
  items: RawItem[];
  next: Cursor | null; // null = source exhausted
}

export type Cursor = Record<string, unknown>;

export interface SourceAdapter {
  readonly kind: string;
  /** Number of independent feeds (e.g. men/women collections); the runner spreads its quota across them. */
  readonly feedCount?: number;
  /** Fetch one page of raw items, politely. Must be safe to call again with the same cursor. */
  fetchPage(cursor: Cursor | null): Promise<Page>;
  /** Turn a raw item into the common schema, or null to skip it (not clothing, kids, ...). */
  normalize(raw: RawItem): NormalizedProduct | null;
}

export interface SourceConfig {
  slug: string;
  name: string;
  kind: "shopify" | "zalando";
  baseUrl: string;
  active?: boolean;
  /** kind-specific options */
  options?: Record<string, unknown>;
}

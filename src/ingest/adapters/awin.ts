// Awin affiliate-feed adapter. The feed is a big gzip CSV behind a secret URL, so it is NOT read here: scripts/awin-select.ts downloads it to a temp folder,
// picks the products and writes a selection file (never into the repo); this adapter reads that file (env AWIN_SELECTION_FILE) and normalizes the rows of ONE merchant.
// The raw payload holds no tracking link: aw_deep_link lives only in the table affiliate_links.
import { readFileSync } from "node:fs";
import { inferCategory } from "../rules";
import type { Cursor, Gender, NormalizedProduct, Page, RawItem, SourceAdapter, SourceConfig } from "../types";

export interface AwinOptions {
  merchant: string;       // merchant_name in the feed
  currency: string;       // currency of the rows (taken from the feed rows, never guessed)
  country?: string;       // market of the prices
  trustRrp?: boolean;     // rrp_price is a real previous price (false: a standing "was" price, no compare-at)
  max?: number;
}
export interface AwinItem {
  id: string; merchant: string; brand: string; name: string; colour: string | null; url: string; categoryText: string;
  image: string; price: number; rrp: number | null; currency: string; gender: Gender | null;
}

const PAGE = 250;
const cents = (v: number | null) => (v == null || !isFinite(v) ? null : Math.round(v * 100));

export class AwinAdapter implements SourceAdapter {
  readonly kind = "awin";
  private o: AwinOptions;
  private items: AwinItem[] | null = null;
  constructor(private cfg: SourceConfig) { this.o = cfg.options as unknown as AwinOptions; }

  private load(): AwinItem[] {
    if (this.items) return this.items;
    const f = process.env.AWIN_SELECTION_FILE;
    if (!f) throw new Error("AWIN_SELECTION_FILE is not set (run scripts/awin-select.ts first)");
    this.items = (JSON.parse(readFileSync(f, "utf8")) as AwinItem[]).filter((i) => i.merchant === this.o.merchant);
    return this.items;
  }

  async fetchPage(cursor: Cursor | null): Promise<Page> {
    const from = Number(cursor?.from ?? 0), all = this.load();
    const items: RawItem[] = all.slice(from, from + PAGE).map((i) => ({ externalId: i.id, payload: { ...i, images: [{ src: i.image }] } }));
    return { items, next: from + PAGE < all.length ? { from: from + PAGE } : null };
  }

  normalize(raw: RawItem): NormalizedProduct | null {
    const i = raw.payload as AwinItem;
    const cat = inferCategory(i.categoryText, i.name);
    if (cat === "other") return null;
    return {
      externalId: raw.externalId, url: i.url, brand: i.brand, name: i.name, gender: i.gender, category: cat, subcategory: i.categoryText || null,
      colour: i.colour, images: [{ url: i.image }], priceCents: cents(i.price),
      compareAtCents: this.o.trustRrp && i.rrp && i.rrp > i.price ? cents(i.rrp) : null,
      currency: i.currency, availability: "in_stock",
    };
  }
}

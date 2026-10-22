// Generic Shopify adapter: reads the public /products.json of a store (config-driven).
import { politeGetJson } from "../http";
import { inferCategory, inferGender, normKey } from "../rules";
import type { Cursor, Gender, NormalizedProduct, Page, RawItem, SourceAdapter, SourceConfig } from "../types";

export interface ShopifyOptions {
  currency: string; // products.json has no currency; comes from the store's /meta.json
  brand?: string; // override when `vendor` is not the brand
  keyBrand?: string; // keep building canonical keys from this string (brand renamed after products already existed)
  defaultGender?: Gender | null; // used when title/type/tags give no signal
  /** Optional collection feeds, e.g. [{handle:"mens-clothing", gender:"men"}]. Default: whole catalogue. */
  feeds?: { handle?: string; gender?: Gender }[];
  only?: string[]; // keep ONLY these categories (e.g. ["accessories"] for accessory-only stores / the accessory pass)
  exclude?: string[]; // categories to skip at ingestion (e.g. ["accessories"]: not used by the feed slots)
  max?: number; // products to keep for this store (default: the CLI --max)
  maxPages?: number; // safety cap per feed
  minDelayMs?: number;
  country?: string; // refresh only: ISO country that fixes the shop's market (Shopify Markets show other prices per visitor country)
}

interface ShopifyProduct {
  id: number; title: string; handle: string; vendor: string; product_type: string; tags: string[] | string;
  options: { name: string; values: string[] }[];
  variants: { price: string; compare_at_price: string | null; available: boolean; option1?: string | null }[];
  images: { src: string; width?: number; height?: number }[];
  _feed?: number; // index into options.feeds, added by fetchPage
}

const cents = (v: string | null | undefined) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100));
const tagList = (t: ShopifyProduct["tags"]) => (Array.isArray(t) ? t : String(t ?? "").split(",").map((s) => s.trim()));

export class ShopifyAdapter implements SourceAdapter {
  readonly kind = "shopify";
  private o: ShopifyOptions;
  constructor(private cfg: SourceConfig) {
    this.o = cfg.options as unknown as ShopifyOptions;
  }

  get feedCount() {
    return this.feeds.length;
  }

  private get feeds() {
    return this.o.feeds?.length ? this.o.feeds : [{}];
  }

  async fetchPage(cursor: Cursor | null): Promise<Page> {
    const feed = Number(cursor?.feed ?? 0);
    const page = Number(cursor?.page ?? 1);
    const f = this.feeds[feed];
    const path = f.handle ? `/collections/${f.handle}/products.json` : "/products.json";
    const data = await politeGetJson<{ products: ShopifyProduct[] }>(
      `${this.cfg.baseUrl}${path}?limit=250&page=${page}${this.o.country ? `&country=${this.o.country}` : ""}`,
      { minDelayMs: this.o.minDelayMs ?? 1500 },
    );
    const items: RawItem[] = data.products.map((p) => ({ externalId: String(p.id), payload: { ...p, _feed: feed } }));
    const exhausted = data.products.length < 250 || page >= (this.o.maxPages ?? 8);
    let next: Cursor | null = { feed, page: page + 1 };
    if (exhausted) next = feed + 1 < this.feeds.length ? { feed: feed + 1, page: 1 } : null;
    return { items, next };
  }

  normalize(raw: RawItem): NormalizedProduct | null {
    const p = raw.payload as ShopifyProduct;
    if (!p.variants?.length || !p.images?.length) return null; // no price/image = unusable
    const tags = tagList(p.tags);
    const feed = this.feeds[p._feed ?? 0];

    // Colour: single colour option value, else a colour tag, else "Name | colour" / "Name - colour" suffix.
    let name = p.title.trim();
    let colour: string | null = null;
    const colourOpt = p.options.find((o) => /^(colou?r|farbe)$/i.test(o.name));
    if (colourOpt?.values.length === 1) colour = colourOpt.values[0];
    const colourTag = tags.map((t) => t.match(/^(?:primary )?colou?r\s*:\s*(.+)$/i)?.[1]).find(Boolean);
    const m = name.match(/^(.*?)\s+[|–—-]\s+([^|–—-]{2,40})$/);
    if (m && (!colour || normKey(m[2]) === normKey(colour) || !colourOpt)) {
      if (m[2].split(/\s+/).length <= 4) { name = m[1].trim(); colour = colour ?? m[2].trim(); }
    }
    colour = colour ?? colourTag?.trim() ?? null;

    const category = inferCategory(p.product_type, p.title, tags.filter((t) => /categor/i.test(t)).join(" "), tags.join(" "));
    if (this.o.exclude?.includes(category)) return null;
    if (this.o.only && !this.o.only.includes(category)) return null;
    const gender = inferGender(feed.gender ?? this.o.defaultGender ?? null, p.product_type, p.title, tags.join(" "), p.handle, p.vendor);

    // Price of the cheapest available variant (else cheapest overall).
    const avail = p.variants.filter((v) => v.available);
    const pool = avail.length ? avail : p.variants;
    const best = pool.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    const priceCents = cents(best.price);
    const compare = cents(best.compare_at_price);

    return {
      externalId: raw.externalId,
      url: `${this.cfg.baseUrl}/products/${p.handle}`,
      brand: (this.o.brand ?? p.vendor).trim(),
      brandKey: this.o.keyBrand?.trim(),
      name,
      gender,
      category,
      subcategory: p.product_type?.trim() || null,
      colour,
      images: p.images.slice(0, 6).map((i) => ({ url: i.src, width: i.width, height: i.height })),
      priceCents: priceCents && priceCents > 0 ? priceCents : null,
      compareAtCents: compare && priceCents && compare > priceCents ? compare : null,
      currency: priceCents && priceCents > 0 ? this.o.currency : null,
      availability: avail.length ? "in_stock" : "out_of_stock",
    };
  }
}

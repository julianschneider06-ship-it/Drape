// One entry per shop. Adding a Shopify store = adding one line here.
import type { SourceConfig } from "./types";

const shopify = (slug: string, name: string, baseUrl: string, currency: string, extra: Record<string, unknown> = {}): SourceConfig =>
  ({ slug, name, kind: "shopify", baseUrl, options: { currency, ...extra } });

export const SOURCES: SourceConfig[] = [
  shopify("taylorstitch", "Taylor Stitch", "https://taylorstitch.com", "USD", { defaultGender: "men" }),
  shopify("fashionnova", "Fashion Nova", "https://fashionnova.com", "USD", { defaultGender: "women", maxPages: 2 }),
  shopify("pangaia", "PANGAIA", "https://pangaia.com", "USD"),
  shopify("armedangels", "ARMEDANGELS", "https://armedangels.com", "EUR", { feeds: [{ handle: "damen", gender: "women" }, { handle: "herren", gender: "men" }] }),
  shopify("outdoorvoices", "Outdoor Voices", "https://outdoorvoices.com", "USD", { defaultGender: "women" }),
  shopify("kith", "Kith", "https://kith.com", "USD"),
  shopify("aimeleondore", "Aimé Leon Dore", "https://aimeleondore.com", "USD", { defaultGender: "men" }),
  shopify("allbirds", "Allbirds", "https://allbirds.com", "USD"),
  shopify("representclo", "Represent", "https://representclo.com", "USD", { brand: "Represent", defaultGender: "men" }),
  shopify("rains", "Rains", "https://rains.com", "EUR"),
  shopify("gymshark", "Gymshark", "https://gymshark.com", "USD", { brand: "Gymshark", keyBrand: "Gymshark | Be a visionary." }),
  // Inactive stub: blocked by bot protection, needs a partner feed.
  { slug: "zalando-de", name: "Zalando DE", kind: "zalando", baseUrl: "https://en.zalando.de", active: false },
];

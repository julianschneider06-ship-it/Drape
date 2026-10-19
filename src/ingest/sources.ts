// One entry per shop. Adding a Shopify store = adding one line here.
import type { SourceConfig } from "./types";

const shopify = (slug: string, name: string, baseUrl: string, currency: string, extra: Record<string, unknown> = {}): SourceConfig =>
  ({ slug, name, kind: "shopify", baseUrl, options: { currency, ...extra } });

export const SOURCES: SourceConfig[] = [
  shopify("taylorstitch", "Taylor Stitch", "https://taylorstitch.com", "USD", { defaultGender: "men" , max: 450 }),
  shopify("fashionnova", "Fashion Nova", "https://fashionnova.com", "USD", { defaultGender: "women", maxPages: 2 }),
  shopify("pangaia", "PANGAIA", "https://pangaia.com", "USD", { max: 340 }),
  shopify("armedangels", "ARMEDANGELS", "https://armedangels.com", "EUR", { feeds: [{ handle: "damen", gender: "women" }, { handle: "herren", gender: "men" }] }),
  shopify("outdoorvoices", "Outdoor Voices", "https://outdoorvoices.com", "USD", { defaultGender: "women" }),
  shopify("kith", "Kith", "https://kith.com", "USD"),
  shopify("aimeleondore", "Aimé Leon Dore", "https://aimeleondore.com", "USD", { defaultGender: "men" , max: 390 }),
  shopify("allbirds", "Allbirds", "https://allbirds.com", "USD", { max: 450 }),
  shopify("representclo", "Represent", "https://representclo.com", "USD", { brand: "Represent", defaultGender: "men" }),
  shopify("rains", "Rains", "https://rains.com", "EUR", { max: 228 }),
  shopify("gymshark", "Gymshark", "https://gymshark.com", "USD", { brand: "Gymshark", keyBrand: "Gymshark | Be a visionary." }),
  // --- Packshot stores (product-only photos on plain backgrounds), added to fill women's bottoms/dresses/sets/shoes and men's shoes.
  // Women, minimal / quiet luxury / boho / romantic:
  shopify("simonmiller", "Simon Miller", "https://simonmillerusa.com", "USD", { brand: "Simon Miller", defaultGender: "women", exclude: ["accessories"], max: 450 }),
  shopify("stinegoya", "Stine Goya", "https://stinegoya.com", "DKK", { defaultGender: "women", exclude: ["accessories"], max: 450 }),
  shopify("nanushka", "Nanushka", "https://nanushka.com", "GBP", { brand: "Nanushka", defaultGender: "women", exclude: ["accessories"], max: 400 }),
  shopify("lisasaysgah", "Lisa Says Gah", "https://lisasaysgah.com", "USD", { brand: "Lisa Says Gah", defaultGender: "women", exclude: ["accessories"], max: 240 }),
  shopify("nililotan", "Nili Lotan", "https://nililotan.com", "USD", { defaultGender: "women", exclude: ["accessories"], max: 350 }),
  shopify("khaite", "Khaite", "https://khaite.com", "USD", { brand: "Khaite", defaultGender: "women", exclude: ["accessories"], max: 400 }),
  shopify("cuyana", "Cuyana", "https://cuyana.com", "USD", { defaultGender: "women", exclude: ["accessories"], max: 250 }),
  shopify("thefrankieshop", "The Frankie Shop", "https://thefrankieshop.com", "USD", { defaultGender: "women", exclude: ["accessories"], max: 250 }),
  // Mixed / sporty / vintage / streetwear / basics:
  shopify("outerknown", "Outerknown", "https://outerknown.com", "USD", { brand: "Outerknown", exclude: ["accessories"], max: 300 }),
  shopify("sportyandrich", "Sporty & Rich", "https://sportyandrich.com", "USD", { brand: "Sporty & Rich", exclude: ["accessories"], max: 300 }),
  shopify("colorfulstandard", "Colorful Standard", "https://colorfulstandard.com", "EUR", { exclude: ["accessories"], max: 250 }),
  // Men, workwear / preppy / classic / streetwear:
  shopify("noah", "Noah", "https://noahny.com", "USD", { brand: "Noah", defaultGender: "men", exclude: ["accessories"], max: 300 }),
  shopify("universalworks", "Universal Works", "https://universalworks.com", "GBP", { defaultGender: "men", exclude: ["accessories"], max: 300 }),
  shopify("oliverspencer", "Oliver Spencer", "https://oliverspencer.co.uk", "GBP", { defaultGender: "men", exclude: ["accessories"], max: 300 }),
  shopify("toddsnyder", "Todd Snyder", "https://toddsnyder.com", "USD", { defaultGender: "men", exclude: ["accessories"], max: 300 }),
  // Shoes:
  shopify("blundstone", "Blundstone", "https://blundstone.com", "USD", { brand: "Blundstone", exclude: ["accessories"], max: 214 }),
  shopify("thursdayboots", "Thursday Boots", "https://thursdayboots.com", "USD", { brand: "Thursday Boots", exclude: ["accessories"], max: 200 }),
  shopify("ancientgreeksandals", "Ancient Greek Sandals", "https://ancient-greek-sandals.com", "EUR", { brand: "Ancient Greek Sandals", defaultGender: "women", exclude: ["accessories"], max: 250 }),
  shopify("birdies", "Birdies", "https://birdies.com", "USD", { brand: "Birdies", defaultGender: "women", exclude: ["accessories"], max: 162 }),
  shopify("koio", "Koio", "https://koio.co", "USD", { brand: "Koio", defaultGender: "men", exclude: ["accessories"], max: 123 }),
  // Inactive stub: blocked by bot protection, needs a partner feed.
  { slug: "zalando-de", name: "Zalando DE", kind: "zalando", baseUrl: "https://en.zalando.de", active: false },
];

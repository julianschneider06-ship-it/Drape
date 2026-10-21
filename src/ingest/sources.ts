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
  // --- Accessory stores (accessories only: options.only), added for the accessory feed. Products are accessories by category rule; AI classification decides the type.
  shopify("brixton", "Brixton", "https://brixton.com", "USD", { brand: "Brixton", only: ["accessories"], max: 90 }),
  shopify("janessaleone", "Janessa Leone", "https://janessaleone.com", "USD", { brand: "Janessa Leone", only: ["accessories"], max: 70 }),
  shopify("lackofcolor", "Lack of Color", "https://lackofcolor.com", "USD", { brand: "Lack of Color", only: ["accessories"], max: 40 }),
  shopify("ebbets", "Ebbets Field Flannels", "https://ebbets.com", "USD", { brand: "Ebbets Field Flannels", only: ["accessories"], max: 40 }),
  shopify("tenthstreethats", "Tenth Street Hats", "https://tenthstreethats.com", "USD", { brand: "Tenth Street Hats", only: ["accessories"], max: 30 }),
  shopify("cotopaxi", "Cotopaxi", "https://cotopaxi.com", "USD", { brand: "Cotopaxi", only: ["accessories"], max: 70 }),
  shopify("drakes", "Drake's", "https://drakes.com", "GBP", { brand: "Drake's", only: ["accessories"], max: 120 }),
  shopify("clarev", "Clare V.", "https://clarev.com", "USD", { brand: "Clare V.", only: ["accessories"], max: 110 }),
  shopify("mansurgavriel", "Mansur Gavriel", "https://mansurgavriel.com", "USD", { brand: "Mansur Gavriel", only: ["accessories"], max: 60 }),
  shopify("dagnedover", "Dagne Dover", "https://dagnedover.com", "USD", { brand: "Dagne Dover", only: ["accessories"], max: 60 }),
  shopify("parkerclay", "Parker Clay", "https://parkerclay.com", "USD", { brand: "Parker Clay", only: ["accessories"], max: 60 }),
  shopify("stateofescape", "State of Escape", "https://stateofescape.com", "AUD", { brand: "State of Escape", only: ["accessories"], max: 40 }),
  shopify("shinola", "Shinola", "https://shinola.com", "USD", { brand: "Shinola", only: ["accessories"], max: 90 }),
  shopify("tannergoods", "Tanner Goods", "https://tannergoods.com", "USD", { brand: "Tanner Goods", only: ["accessories"], max: 50 }),
  shopify("missoma", "Missoma", "https://missoma.com", "GBP", { brand: "Missoma", only: ["accessories"], max: 110 }),
  shopify("gorjana", "gorjana", "https://gorjana.com", "USD", { brand: "gorjana", only: ["accessories"], max: 70 }),
  shopify("jennybird", "Jenny Bird", "https://jenny-bird.com", "USD", { brand: "Jenny Bird", only: ["accessories"], max: 70 }),
  shopify("alighieri", "Alighieri", "https://alighieri.com", "GBP", { brand: "Alighieri", only: ["accessories"], max: 60 }),
  shopify("tomwood", "Tom Wood", "https://tomwoodproject.com", "EUR", { brand: "Tom Wood", only: ["accessories"], max: 60 }),
  shopify("nordgreen", "Nordgreen", "https://nordgreen.com", "EUR", { brand: "Nordgreen", only: ["accessories"], max: 70 }),
  shopify("vaer", "Vaer", "https://vaerwatches.com", "USD", { brand: "Vaer", only: ["accessories"], max: 50 }),
  shopify("larssonjennings", "Larsson & Jennings", "https://larssonandjennings.com", "USD", { brand: "Larsson & Jennings", only: ["accessories"], max: 40 }),
  shopify("timex", "Timex", "https://timex.com", "USD", { brand: "Timex", only: ["accessories"], max: 60 }),
  shopify("mvmt", "MVMT", "https://mvmt.com", "USD", { brand: "MVMT", only: ["accessories"], max: 90 }),
  shopify("raen", "Raen", "https://raen.com", "USD", { brand: "Raen", only: ["accessories"], max: 70 }),
  shopify("quay", "Quay", "https://quay.com", "USD", { brand: "Quay", only: ["accessories"], max: 70 }),
  shopify("shwood", "Shwood", "https://shwoodshop.com", "USD", { brand: "Shwood", only: ["accessories"], max: 70 }),
  shopify("missionbelt", "Mission Belt", "https://missionbelt.com", "USD", { brand: "Mission Belt", only: ["accessories"], max: 110 }),
  shopify("johnstons", "Johnstons of Elgin", "https://johnstonsofelgin.com", "GBP", { brand: "Johnstons of Elgin", only: ["accessories"], max: 40 }),
  shopify("thetiebar", "The Tie Bar", "https://thetiebar.com", "USD", { brand: "The Tie Bar", only: ["accessories"], max: 25 }),
  // Inactive stub: blocked by bot protection, needs a partner feed.
  { slug: "zalando-de", name: "Zalando DE", kind: "zalando", baseUrl: "https://en.zalando.de", active: false },
];

// Probe candidate Shopify stores for ACCESSORIES: does /products.json work, how many products per accessory family, are the
// first images plain-background packshots? Low request rate (<= 4 products.json pages + 30 thumbnails per store).
// Usage: npx tsx scripts/probe-accessories.ts host1 host2 ...   (JSON lines on stdout)
import { politeGetJson } from "../src/ingest/http";
import { pixelStats } from "../src/images/score";

const FAMILY: [string, RegExp][] = [
  ["head", /\b(caps?|hats?|beanies?|bucket hat|visors?|berets?|beret|fedora|trucker|snapback|balaclava)\b/i],
  ["bag", /\b(bags?|totes?|backpacks?|rucksack|crossbody|clutch|satchel|duffle|duffel|pouch|purse|handbag|shoulder bag|bum bag|fanny pack|messenger)\b/i],
  ["watch", /\b(watch(?:es)?|chronograph|timepiece)\b/i],
  ["eyewear", /\b(sunglasses|sunnies|eyewear|shades|glasses)\b/i],
  ["belt", /\b(belts?)\b/i],
  ["scarf", /\b(scarf|scarves|shawl|bandana|neckerchief|wrap)\b/i],
  ["jewelry", /\b(necklaces?|bracelets?|earrings?|rings?|pendants?|chains?|studs?|hoops?|anklets?|brooch|charms?|bangles?|cuffs?)\b/i],
  ["gloves", /\b(gloves?|mittens?)\b/i],
  ["tie", /\b(neckties?|bow ?ties?|ties?)\b/i],
];
const NOT = /\b(gift ?cards?|e-?gift|sticker|candle|mug|bottle|towel|blanket|shoe care|cleaner|brush|key ?ring|keychain|case for|laptop|lunch|vase|flask|poster|book|socks?|underwear|boxers?|bra|swim|sample|swatch|repair|insurance|shipping)\b/i;

(async () => {
  for (const host of process.argv.slice(2)) {
    const base = `https://${host}`; const out: Record<string, unknown> = { host };
    try {
      const prods: { title: string; product_type: string; tags: string[] | string; images: { src: string }[]; variants: { available: boolean }[] }[] = [];
      for (let page = 1; page <= 4; page++) {
        const d = await politeGetJson<{ products: typeof prods }>(`${base}/products.json?limit=250&page=${page}`, { minDelayMs: 1500, retries: 2 });
        prods.push(...d.products); if (d.products.length < 250) break;
      }
      const fam: Record<string, typeof prods> = {};
      for (const p of prods) {
        const t = `${p.product_type} ${p.title}`;
        if (NOT.test(t) || !p.images?.length) continue;
        const f = FAMILY.find(([, re]) => re.test(t))?.[0]; if (f) (fam[f] ??= []).push(p);
      }
      const all = Object.values(fam).flat();
      const step = Math.max(1, Math.floor(all.length / 30)); let plain = 0, tested = 0;
      for (const p of all.filter((_, i) => i % step === 0).slice(0, 30)) {
        try { const px = await pixelStats(p.images[0].src); if (px) { tested++; if (px.bg >= 0.6) plain++; } } catch { /* skip */ }
      }
      Object.assign(out, { ok: true, total: prods.length, acc: all.length, families: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, v.length])), plain_share: tested ? +(plain / tested).toFixed(2) : null, tested,
        sample: all.slice(0, 12).map((p) => p.images[0].src) });
    } catch (e) { Object.assign(out, { ok: false, error: String(e).slice(0, 100) }); }
    console.log(JSON.stringify(out));
  }
})();

// Read-only analysis of downloaded Awin feed files (no network, nothing stored). Usage: npx tsx scripts/probe-awin-brands.ts <brands.gz> <first.gz> <out-dir>
// Writes summary.json and samples.json (for probe-awin-usable.ts) into out-dir (outside the repo).
import { createReadStream, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";

function parseLine(s: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out;
}
async function load(path: string, keep?: (h: string[], r: string[]) => string[] | null): Promise<{ header: string[]; rows: string[][] }> {
  const gz = createReadStream(path).pipe(createGunzip()); gz.setEncoding("utf8");
  let buf = "", rec = "", header: string[] | null = null; const rows: string[][] = [];
  const take = (line: string) => { rec = rec ? rec + "\n" + line : line; if ((rec.match(/"/g)?.length ?? 0) % 2) return; const f = parseLine(rec); rec = ""; if (!header) header = f; else { const k = keep ? keep(header, f) : f; if (k) rows.push(k); } };
  for await (const chunk of gz) { buf += chunk; let i; while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); } }
  if (buf) take(buf);
  return { header: header!, rows };
}
const cat = (path: string, name: string): string => {
  const t = `${path} ${name}`.toLowerCase();
  if (/watch|jewel|ring\b|necklace|bracelet|earring|bag\b|bags|handbag|belt|hat\b|hats|cap\b|caps|beanie|scarf|scarves|sunglass|glasses|glove|wallet|accessor|tie\b|cufflink|sock|backpack/.test(t)) return "accessories";
  if (/shoe|boot|trainer|sneaker|sandal|loafer|footwear|slipper|heel|chuck|clog|all star|runner|samba|gazelle|dunk|air max|jordan|old skool|ultraboost|gel-|suede/.test(t)) return "shoes";
  if (/coat|jacket|parka|gilet|blazer|outerwear|puffer|anorak|vest\b|waistcoat/.test(t)) return "outerwear";
  if (/trouser|pant|jean|short|chino|skirt|jogger|legging|bottom|denim/.test(t)) return "bottoms";
  if (/shirt|tee|t-shirt|top\b|tops|sweat|hoodie|knit|jumper|polo|dress|cardigan|blouse|pullover|fleece|clothing|apparel|suit/.test(t)) return "tops";
  return "other";
};
const fashion = (c: string) => c !== "other";
const num = (s: string) => parseFloat(s) || 0;

(async () => {
  const [bPath, fPath, out] = process.argv.slice(2);
  const firstIds = new Set<string>(); const first = await load(fPath, (h, r) => { firstIds.add(r[h.indexOf("merchant_id")]); return null; });
  const b = await load(bPath); const H = b.header; const ix = (n: string) => H.indexOf(n);
  const g = (r: string[], n: string) => r[ix(n)] ?? "";
  const per = new Map<string, string[][]>();
  for (const r of b.rows) { const k = `${g(r, "merchant_id")}|${g(r, "merchant_name")}`; (per.get(k) ?? per.set(k, []).get(k)!).push(r); }
  const sameCols = H.length === first.header.length && H.every((h, i) => h === first.header[i]);
  const merchants = [...per].sort((a, c) => c[1].length - a[1].length).map(([k, rows]) => {
    const [id, name] = k.split("|"); const brands = new Map<string, number>(); const cats: Record<string, number> = {}; const cur: Record<string, number> = {};
    let inStock = 0, disc = 0, link = 0, fash = 0, img = 0;
    for (const r of rows) {
      const bn = g(r, "brand_name") || "(none)"; brands.set(bn, (brands.get(bn) ?? 0) + 1);
      const c = cat(g(r, "merchant_product_category_path") || g(r, "merchant_category") || g(r, "category_name") || g(r, "merchant_category"), g(r, "product_name")); cats[c] = (cats[c] ?? 0) + 1; if (fashion(c)) fash++;
      cur[g(r, "currency")] = (cur[g(r, "currency")] ?? 0) + 1;
      if (g(r, "in_stock") === "1") inStock++;
      if (num(g(r, "rrp_price")) > num(g(r, "search_price") || g(r, "store_price"))) disc++;
      if (g(r, "aw_deep_link")) link++; if (g(r, "merchant_image_url")) img++;
    }
    return { id, name, isNew: !firstIds.has(id), rows: rows.length, fashion: fash, fashionPct: Math.round(100 * fash / rows.length), currencies: cur, inStockPct: Math.round(100 * inStock / rows.length), discount: disc, deepLink: link, withImage: img, cats, brandCount: brands.size, topBrands: [...brands].sort((a, c) => c[1] - a[1]).slice(0, 12) };
  });
  const brandAll = new Map<string, number>();
  for (const r of b.rows) { const bn = g(r, "brand_name") || "(none)"; brandAll.set(bn, (brandAll.get(bn) ?? 0) + 1); }
  // samples: largest new merchants with >= 20 fashion rows, plus Bennimarceau (old merchant, 25x more rows now), 20 random in-stock fashion products with image
  const pick = merchants.filter((m) => (m.isNew && m.fashion >= 20) || m.name === "Bennimarceau.com").sort((a, c) => Number(c.isNew) - Number(a.isNew) || c.fashion - a.fashion).slice(0, 6);
  const samples: Record<string, { id: string; img: string; name: string; slot: string }[]> = {};
  for (const m of pick) {
    const pool = per.get(`${m.id}|${m.name}`)!.filter((r) => fashion(cat(g(r, "merchant_product_category_path") || g(r, "merchant_category") || g(r, "category_name"), g(r, "product_name"))) && g(r, "merchant_image_url") && g(r, "in_stock") === "1");
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    samples[m.name] = pool.slice(0, 20).map((r) => ({ id: g(r, "aw_product_id"), img: g(r, "merchant_image_url"), name: g(r, "product_name"), slot: "" }));
  }
  // overlap keys (host + path of merchant_deep_link, brand+title) for the DB check, no query strings
  const keys = b.rows.map((r) => ({ m: g(r, "merchant_name"), brand: g(r, "brand_name"), title: g(r, "product_name"), url: g(r, "merchant_deep_link").replace(/^https?:\/\/(www\.)?/, "").split(/[?#]/)[0].replace(/\/$/, "") }));
  const hosts = new Map<string, number>(); for (const k of keys) { const h = k.url.split("/")[0]; hosts.set(h, (hosts.get(h) ?? 0) + 1); }
  writeFileSync(`${out}/summary.json`, JSON.stringify({ rows: b.rows.length, columns: H.length, sameCols, merchants, topBrands: [...brandAll].sort((a, c) => c[1] - a[1]).slice(0, 30), hosts: [...hosts].sort((a, c) => c[1] - a[1]).slice(0, 40) }, null, 1));
  writeFileSync(`${out}/samples.json`, JSON.stringify(samples));
  writeFileSync(`${out}/keys.json`, JSON.stringify(keys));
  console.log("rows", b.rows.length, "cols", H.length, "sameCols", sameCols, "merchants", merchants.length, "samples", Object.keys(samples).join(";"));
})();

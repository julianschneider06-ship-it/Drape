// Converts source pictures into the app's background WebPs and regenerates the manifest.
// Input:  docs/reference/backgrounds-source/<season>-<family>-<1|2|3>.<png|jpg|jpeg>  or  neutral-<1|2|3>.<ext>  (originals stay untouched)
// Output: public/backgrounds/<name>.webp (1080x2340, cover crop, quality ~80, target < 250 KB)
// Usage:  npx tsx scripts/add-backgrounds.ts [--src <folder>] [--out <folder>]   (no AI, no network, no cost)
import { readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import sharp from "sharp";
import { BG_ALLOWED, BG_IMAGE } from "../src/config/background-images";
import { buildManifest, MANIFEST_FS } from "./build-bg-manifest";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const src = arg("--src") ?? join(process.cwd(), "docs", "reference", "backgrounds-source");
const out = arg("--out") ?? join(process.cwd(), "public", "backgrounds");

async function main() {
  if (!existsSync(src)) { console.log(`no source folder: ${src}`); return; }
  mkdirSync(out, { recursive: true });
  let ok = 0, bad = 0;
  for (const f of readdirSync(src).sort()) {
    const ext = extname(f).toLowerCase(), name = basename(f, extname(f));
    if (![".png", ".jpg", ".jpeg"].includes(ext)) continue;
    if (!BG_ALLOWED.includes(name)) { console.log(`SKIP ${f}: name is not one of the ${BG_ALLOWED.length} allowed names (<season>-<family>-<1|2|3>, neutral-<1|2|3>)`); bad++; continue; }
    let q = BG_IMAGE.quality, size = 0;
    for (; q >= 40; q -= 10) {   // lower the quality until the file is small enough
      await sharp(join(src, f)).rotate().resize(BG_IMAGE.width, BG_IMAGE.height, { fit: "cover", position: "centre" }).webp({ quality: q }).toFile(join(out, `${name}.webp`));
      size = statSync(join(out, `${name}.webp`)).size;
      if (size <= BG_IMAGE.maxKb * 1024) break;
    }
    console.log(`OK   ${name}.webp  ${Math.round(size / 1024)} KB  q${q}${size > BG_IMAGE.maxKb * 1024 ? "  (over target)" : ""}`);
    ok++;
  }
  const dir = out;
  const list = buildManifest(dir, out === join(process.cwd(), "public", "backgrounds") ? MANIFEST_FS : join(out, "..", "manifest-test.json"));
  console.log(`done: ${ok} converted, ${bad} skipped, manifest lists ${list.length}`);
}
main();

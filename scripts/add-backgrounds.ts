// Converts source pictures into the app's background WebPs and regenerates the manifest.
// Input:  docs/reference/backgrounds-source/<season>-<family>-<1..5>.<png|jpg|jpeg>  or  neutral-<n>.<ext> (any n >= 1)  (originals stay untouched)
// Output: public/backgrounds/<name>.webp (1080x1920 = 9:16; only a source more than 3% off 9:16 is centre-cropped, otherwise scaled; quality ~80, target < 250 KB)
// Usage:  npx tsx scripts/add-backgrounds.ts [--src <folder>] [--out <folder>]   (no AI, no network, no cost)
import { readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import sharp from "sharp";
import { isAllowedName, BG_IMAGE, MAX_PER_COMBO } from "../src/config/background-images";
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
    if (!isAllowedName(name)) { console.log(`SKIP ${f}: name is not allowed (<season>-<family>-<1..${MAX_PER_COMBO}> for the 15 combinations, neutral-<n>)`); bad++; continue; }
    const rotated = await sharp(join(src, f)).rotate().toBuffer();
    const meta = await sharp(rotated).metadata();
    const target = BG_IMAGE.width / BG_IMAGE.height, ratio = (meta.width ?? 1) / (meta.height ?? 1);
    const cropped = Math.abs(ratio / target - 1) > BG_IMAGE.ratioTolerance;
    if (cropped) console.log(`NOTE ${f}: ${meta.width}x${meta.height} is not within ${BG_IMAGE.ratioTolerance * 100}% of 9:16, centre-cropped`);
    let q = BG_IMAGE.quality, size = 0;
    for (; q >= BG_IMAGE.minQuality; q -= BG_IMAGE.qualityStep) {   // lower the quality until the file is small enough (floor = minQuality)
      await sharp(rotated).resize(BG_IMAGE.width, BG_IMAGE.height, { fit: cropped ? "cover" : "fill", position: "centre" }).webp({ quality: q }).toFile(join(out, `${name}.webp`));
      size = statSync(join(out, `${name}.webp`)).size;
      if (size <= BG_IMAGE.maxKb * 1024) break;
    }
    q = Math.max(q, BG_IMAGE.minQuality);
    console.log(`OK   ${name}.webp  ${Math.round(size / 1024)} KB  q${q}${size > BG_IMAGE.maxKb * 1024 ? "  (over target)" : ""}`);
    ok++;
  }
  const dir = out;
  const list = buildManifest(dir, out === join(process.cwd(), "public", "backgrounds") ? MANIFEST_FS : join(out, "..", "manifest-test.json"));
  console.log(`done: ${ok} converted, ${bad} skipped, manifest lists ${list.length}`);
}
main();

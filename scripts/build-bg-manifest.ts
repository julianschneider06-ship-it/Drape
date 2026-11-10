// Writes src/config/background-manifest.json = the list of background pictures that exist in public/backgrounds (only allowed names; wishlist.webp is not one).
// Usage: npx tsx scripts/build-bg-manifest.ts   (add-backgrounds.ts calls it too)
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BG_ALLOWED } from "../src/config/background-images";

export const BG_DIR_FS = join(process.cwd(), "public", "backgrounds");
export const MANIFEST_FS = join(process.cwd(), "src", "config", "background-manifest.json");

export function buildManifest(dir: string = BG_DIR_FS, out: string = MANIFEST_FS): string[] {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".webp") && BG_ALLOWED.includes(f.replace(/\.webp$/, ""))).sort() : [];
  writeFileSync(out, JSON.stringify({ images: files }, null, 2) + "\n");
  return files;
}

if (process.argv[1]?.endsWith("build-bg-manifest.ts")) console.log(`manifest: ${buildManifest().length} images`);

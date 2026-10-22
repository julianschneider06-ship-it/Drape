// Catalogue snapshot job (background, idempotent): see src/outfits/build-snapshot.ts. Usage: npx tsx scripts/build-catalogue.ts [--dry]
import { buildSnapshot } from "../src/outfits/build-snapshot";

buildSnapshot({ dry: process.argv.includes("--dry") }).then((r) => console.log(`pieces ${r.pieces}, accessories ${r.accs}, version ${r.version}, packed ${r.packedKB} KB (base64 gzip), ${(r.ms / 1000).toFixed(1)}s${r.stored ? `, stored snapshot ${r.stored}` : " (dry)"}`)).catch((e) => { console.error(e); process.exit(1); });

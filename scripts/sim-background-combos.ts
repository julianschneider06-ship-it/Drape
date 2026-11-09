// Read-only: frequency of (dominant season x style family) over N composed outfits per direction, through the public POST /api/dynamic like the app (default hybrid composer, fresh device,
// no picks, no taste). No DB, no tokens, no AI, no cost. Writes the raw tag tuples as JSON to --out.
//   npx tsx scripts/sim-background-combos.ts --url https://<deployment> --gender men|women [--n 1000] [--seed 1] [--out file.json]
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { FeedOutfit } from "../src/lib/types";

const args = process.argv.slice(2), opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const URL_ = opt("url")?.replace(/\/$/, ""), G = opt("gender") as "men" | "women", N = Number(opt("n") ?? 1000), SEED = Number(opt("seed") ?? 1), OUT = opt("out");
if (!URL_ || (G !== "men" && G !== "women")) { console.error("usage: --url https://<deployment> --gender men|women [--n 1000] [--seed 1] [--out file.json]"); process.exit(1); }

(async () => {
  const device = randomUUID(), rows: { se: string; sf: number; sp: string; sd: string; ss: string | null; id: string }[] = [];
  let ban = "", recent: { ids: number[]; style: string; store: string }[] = [];
  for (let page = 0; rows.length < N; page++) {
    let res: Response | null = null;
    for (let a = 0; a < 6 && !res?.ok; a++) {
      if (a) await new Promise((r) => setTimeout(r, 4000 * a));
      res = await fetch(`${URL_}/api/dynamic`, { method: "POST", body: JSON.stringify({ device_id: device, gender: G, recent, ban, rs: SEED * 100003 + page }) }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1200));   // stay under the public rate limit
    }
    if (!res?.ok) throw new Error(`dynamic ${res?.status}`);
    const j = (await res.json()) as { items: FeedOutfit[]; ban?: string };
    ban = j.ban ?? ban;
    if (!j.items.length) break;
    for (const o of j.items) if (rows.length < N && o.tags) rows.push({ se: o.tags.season_primary, sf: o.tags.season_fit, sp: o.tags.style_primary, sd: o.tags.style_distinct, ss: o.tags.style_secondary, id: (o.dyn?.ids ?? []).join("-") });
    recent = [...recent, ...j.items.map((o) => ({ ids: o.dyn!.ids, style: o.dyn!.style, store: o.dyn!.store }))].slice(-12);
  }
  console.log(`${G}: ${rows.length} outfits`);
  if (OUT) writeFileSync(OUT, JSON.stringify(rows));
})().catch((e) => { console.error(String(e)); process.exit(1); });

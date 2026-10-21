// Every product that was shown in the feeds (ids collected from the live API) must be in the set of eligible products: in-stock offer, clean cutout,
// measurements (outfit_inputs for main pieces, acc_inputs for accessories). Usage: IDS=seen_ids.json npx tsx scripts/spike/check-shown.ts
import { readFileSync } from "node:fs";
import { rpc } from "../../src/ingest/gateway";
async function all(fn: string) { const out: number[] = []; let after = 0; for (;;) { const p = await rpc<{ id: number }[]>(fn, { p_after: after, p_limit: 1000 }); if (!p.length) break; out.push(...p.map((x) => x.id)); after = p[p.length - 1].id; } return out; }
(async () => {
  const seen = JSON.parse(readFileSync(process.env.IDS!, "utf8")) as number[];
  const ok = new Set([...(await all("outfit_inputs")), ...(await all("acc_inputs"))]);
  const bad = seen.filter((id) => !ok.has(id));
  console.log(`shown products ${seen.length}, eligible set ${ok.size}, NOT eligible (sold out / no cutout / no measurement): ${bad.length}${bad.length ? " ids " + bad.slice(0, 30).join(",") : ""}`);
})();

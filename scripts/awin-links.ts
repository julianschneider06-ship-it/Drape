// Stores the affiliate links of the selected Awin products. Usage: npx tsx scripts/awin-links.ts <out-dir>/links.json   (needs DRAPE_PIPELINE_TOKEN)
// Insert / update only (rpc affiliate_links_upsert, table affiliate_links, no public access). The file holds tracking links: keep it outside the repo and delete it afterwards.
import { readFileSync } from "node:fs";
import { rpc } from "../src/ingest/gateway";

(async () => {
  const items = JSON.parse(readFileSync(process.argv[2], "utf8")) as unknown[];
  let n = 0;
  for (let i = 0; i < items.length; i += 100) n += await rpc<number>("affiliate_links_upsert", { p_items: items.slice(i, i + 100) });
  console.log(`affiliate_links: ${n} of ${items.length} rows stored`);
})().catch((e) => { console.error(String(e).replace(/https?:\/\/\S+/g, "<url>").slice(0, 300)); process.exit(1); });

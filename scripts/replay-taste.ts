// Rebuild a device's taste from the event log (source of truth): used for login / a new device / sync, and to check the client-held taste.
// Incremental: --since <iso time> replays only newer events on top of --taste <base64>. No AI, no cost.
// Usage: DRAPE_PIPELINE_TOKEN=... npx tsx scripts/replay-taste.ts --device <uuid> [--gender women|men] [--taste <base64>] [--since <iso>]
import { rpc } from "../src/ingest/gateway";
import { buildCatalogue, unpackSnapshot } from "../src/outfits/catalogue";
import { newTaste } from "../src/outfits/taste";
import { applySignals, decodeTaste, encodeTaste, eventsToSignals, type EventRow } from "../src/outfits/taste-codec";
import { summarize } from "../src/lib/personalization/summary";

const args = process.argv.slice(2), opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
(async () => {
  const device = opt("device"), gender = opt("gender") ?? "women";
  if (!device) throw new Error("--device is required");
  const cat = buildCatalogue(unpackSnapshot((await rpc<{ data: string }>("snapshot_get", { p_known_version: null })).data));
  const t = decodeTaste(opt("taste")) ?? newTaste();
  const rows: EventRow[] = []; let after: string | null = opt("since") ?? null;
  for (;;) { const page = await rpc<EventRow[]>("events_for_device", { p_device: device, p_gender: gender, p_after: after, p_limit: 5000 }); rows.push(...page); if (page.length < 5000) break; after = page[page.length - 1].at; }
  const r = applySignals(cat, t, eventsToSignals(rows));
  const b64 = encodeTaste(t);
  console.log(JSON.stringify({ device, gender, events: rows.length, applied: r.applied, skipped: r.skipped, bytes: b64.length, summary: summarize(t) }, null, 1).slice(0, 4000));
})().catch((e) => { console.error(e); process.exit(1); });

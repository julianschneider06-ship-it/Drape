// Prebuild step: bundle the current catalogue snapshot with the functions, so a cold instance reads it from its own disk (about 5 ms) instead of downloading it
// through the gateway (0.6-0.9 s). Best effort: without a token or on any error the build goes on and instances fetch the snapshot at runtime as before.
// The bundled snapshot is only the starting point: every instance still checks the version in the background and swaps to a newer snapshot.
import { mkdirSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";
try {
  const token = process.env.DRAPE_PIPELINE_TOKEN; if (!token) throw new Error("no DRAPE_PIPELINE_TOKEN in the build environment");
  const res = await fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action: "rpc", fn: "snapshot_get", args: { p_known_version: null } }), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const { data } = await res.json();
  if (!data?.data || !data?.version) throw new Error("no snapshot in the answer");
  mkdirSync("src/generated", { recursive: true });
  // one file per gender (its own pieces + unisex / unknown ones): a cold instance unpacks only the gender it needs
  const snap = JSON.parse(gunzipSync(Buffer.from(data.data, "base64")).toString("utf8")), sizes = [];
  for (const g of ["women", "men"]) {
    const ok = (x) => x.gender === g || (x.gender !== "women" && x.gender !== "men");
    const part = Buffer.from(gzipSync(Buffer.from(JSON.stringify({ version: snap.version, pieces: snap.pieces.filter(ok), accs: snap.accs.filter(ok) })), { level: 9 })).toString("base64");
    writeFileSync(`src/generated/snapshot.${g}.b64`, part); sizes.push(`${g} ${Math.round(part.length / 1024)} KB`);
  }
  writeFileSync("src/generated/snapshot.version", data.version);
  // the starter set (60 outfits per gender, a small fixed table): a cold instance needs it for the starter pages and for banning the starter pieces
  for (const g of ["women", "men"]) {
    const r = await fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action: "rpc", fn: "starter_list", args: { p_gender: g } }), signal: AbortSignal.timeout(30_000) });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.data) && j.data.length) { writeFileSync(`src/generated/starter.${g}.json`, JSON.stringify(j.data)); sizes.push(`starter ${g} ${j.data.length} rows`); } }
  }
  console.log(`bundled catalogue snapshot ${data.version} (${sizes.join(", ")})`);
} catch (e) { console.log(`snapshot not bundled (${String(e).slice(0, 120)}); instances fetch it at runtime`); }

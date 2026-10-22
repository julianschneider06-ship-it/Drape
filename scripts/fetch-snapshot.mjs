// Prebuild step: bundle the current catalogue snapshot with the functions, so a cold instance reads it from its own disk (about 5 ms) instead of downloading it
// through the gateway (0.6-0.9 s). Best effort: without a token or on any error the build goes on and instances fetch the snapshot at runtime as before.
// The bundled snapshot is only the starting point: every instance still checks the version in the background and swaps to a newer snapshot.
import { mkdirSync, writeFileSync } from "node:fs";
const URL_ = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";
try {
  const token = process.env.DRAPE_PIPELINE_TOKEN; if (!token) throw new Error("no DRAPE_PIPELINE_TOKEN in the build environment");
  const res = await fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action: "rpc", fn: "snapshot_get", args: { p_known_version: null } }), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const { data } = await res.json();
  if (!data?.data || !data?.version) throw new Error("no snapshot in the answer");
  mkdirSync("src/generated", { recursive: true });
  writeFileSync("src/generated/snapshot.b64", data.data); writeFileSync("src/generated/snapshot.version", data.version);
  console.log(`bundled catalogue snapshot ${data.version} (${Math.round(data.data.length / 1024)} KB)`);
} catch (e) { console.log(`snapshot not bundled (${String(e).slice(0, 120)}); instances fetch it at runtime`); }

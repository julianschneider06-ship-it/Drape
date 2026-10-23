// Read-only probe of the Awin product feed. Reads AWIN_FEED_URL from the environment (never printed).
// Usage: AWIN_FEED_URL=... npx tsx scripts/probe-awin.ts
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";

const url = process.env.AWIN_FEED_URL;
if (!url) {
  console.log("AWIN_FEED_URL is not set");
  process.exit(1);
}

function parseLine(s: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  const res = await fetch(url!, { headers: { "User-Agent": "drape-probe" } });
  if (!res.ok || !res.body) {
    console.log(`feed host answered ${res.status}; stopping`);
    process.exit(1);
  }
  const gz = Readable.fromWeb(res.body as never).pipe(createGunzip());
  gz.setEncoding("utf8");
  let buf = "", rec = "", header: string[] | null = null, rows = 0;
  const per = new Map<string, number>();
  const take = (line: string) => {
    rec = rec ? rec + "\n" + line : line;
    if ((rec.match(/"/g)?.length ?? 0) % 2) return; // inside a quoted multi-line field
    const f = parseLine(rec);
    rec = "";
    if (!header) { header = f; return; }
    rows++;
    const key = `${f[header.indexOf("merchant_id")]} ${f[header.indexOf("merchant_name")]}`;
    per.set(key, (per.get(key) ?? 0) + 1);
  };
  for await (const chunk of gz) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); }
  }
  if (buf) take(buf);
  console.log("columns:", (header as string[] | null)?.join(","));
  console.log("rows:", rows);
  for (const [k, v] of [...per].sort((a, b) => b[1] - a[1])) console.log(v, k);
}

main().catch((e) => {
  console.log("error:", String(e?.message ?? e).split(url!).join("<url>"));
  process.exit(1);
});

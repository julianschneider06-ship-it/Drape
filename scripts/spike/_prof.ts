import { loadCat } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { alternativesFor } from "../../src/outfits/compose-alts";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { decodeTaste } from "../../src/outfits/taste-codec";
import { tasteMatch } from "../../src/outfits/taste";
import { readFileSync } from "node:fs";
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const dump = JSON.parse(readFileSync(process.env.DUMP!, "utf8")); const t = decodeTaste(dump["men/old money / classic"].taste)!;
  for (const [name, taste] of [["neutral", null], ["personal", t]] as const) {
    let c = 0, a = 0; const rnd = makeRnd(3);
    for (let k = 0; k < 10; k++) { const t0 = performance.now(); const r = compose(cat, { gender: "men", taste }, new BanState(), 6, newSession(), rnd); const t1 = performance.now(); const eff = r.ban.effective(cat, "men"); r.outfits.forEach((o) => alternativesFor(cat, "men", o, eff, taste)); c += t1 - t0; a += performance.now() - t1; }
    console.log(name, "compose ms/page", (c / 10).toFixed(1), "alternatives ms/page", (a / 10).toFixed(1));
  }
  const ps = cat.pieces; const t0 = performance.now(); let s = 0; for (const p of ps) s += tasteMatch(t, p); console.log("tasteMatch over", ps.length, "pieces ms", (performance.now() - t0).toFixed(1));
})();

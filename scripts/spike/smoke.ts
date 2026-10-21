import { loadCat } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
(async () => {
  const { cat, loadMs, blobKB } = await loadCat(process.env.SNAP_CACHE);
  console.log(`catalogue ${cat.pieces.length} pieces ${cat.accs.length} acc, load ${loadMs.toFixed(0)} ms, blob ${blobKB.toFixed(0)} KB`);
  for (const g of ["women", "men"] as const) {
    const rnd = makeRnd(11), ses = newSession(); let ban = new BanState();
    const times: number[] = [];
    for (let page = 0; page < 5; page++) {
      const r = compose(cat, { gender: g, taste: null }, ban, 6, ses, rnd); ban = r.ban; times.push(r.stats.ms);
      if (page === 0) { for (const o of r.outfits) console.log(g, o.bucket, o.kind, o.score, o.style, o.season.season, o.season.fit, o.ids.join(","), "acc", o.acc.map((a) => a.type).join("+"), o.pattern ?? ""); console.log("rejects", JSON.stringify(r.stats.rejects), "attempts", r.stats.attempts); }
    }
    console.log(g, "ms per page", times.map((t) => t.toFixed(0)).join(" "), "ban ids", ban.ids.length);
  }
})();

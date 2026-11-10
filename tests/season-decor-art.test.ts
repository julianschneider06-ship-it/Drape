import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DECOR_ART, DECOR_OVERSCAN_PX, LAYER_Z } from "../src/config/season-decor";
import { HIT_ICON_ZONE } from "../src/config/hit-area";
import { artClip, artLayerStyle, computeDecorRect, parseDecorMode } from "../src/lib/season-decor";

function webpSize(file: string): [number, number] {   // minimal header parse (VP8X / VP8L / VP8)
  const b = readFileSync(file), t = b.toString("ascii", 12, 16);
  if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (t === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}
for (const [season, layers] of Object.entries(DECOR_ART)) {
  test(`${season} has layers with existing files, true aspect and sane sizes`, () => {
    assert.ok(layers.length > 0);
    for (const l of layers) {
      assert.ok(existsSync(`public${l.src}`), l.src);
      const [w, h] = webpSize(`public${l.src}`);
      assert.ok(Math.abs(l.aspect / (w / h) - 1) < 0.01, `${l.src} aspect ${l.aspect} vs file ${w / h}`);
      assert.ok(l.widthMode === "stage" || l.widthPct != null || l.heightPct != null);
      assert.ok((l.widthPct ?? 0) <= 100 && (l.heightPct ?? 0) <= 100);
      assert.ok(l.opacity > 0 && l.opacity <= 1);
      if (!l.stretch) assert.ok(!(l.widthPct != null && l.heightPct != null) && l.widthMode !== "stage", "no stretching without stretch: true");
      if (l.stretch) assert.ok((l.maxStretch ?? 0) > 0 && (l.maxStretch ?? 0) <= 0.4);
    }
  });
}
const STAGES = [{ x: 0, y: 96, w: 390, h: 560 }, { x: 0, y: 104, w: 430, h: 700 }, { x: 0, y: 88, w: 360, h: 520 }];
const OS = DECOR_OVERSCAN_PX, near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const edges: Record<string, string[]> = { spring_meadow: ["bottom", "left", "right"], summer_wave: ["bottom", "left", "right"], winter_clouds: ["top", "left", "right"], autumn_tree: ["top", "bottom", "left"] };
const nameOf = (l: { src: string }) => l.src.split("/").pop()!.replace(".webp", "");
test("border sprites touch the STAGE edges exactly (difference 0 within the overscan)", () => {
  for (const st of STAGES) for (const l of Object.values(DECOR_ART).flat()) {
    const r = computeDecorRect(l, st)!, name = nameOf(l);
    for (const side of edges[name] ?? []) {
      assert.ok((l.flush ?? []).includes(side as never), `${name} flush ${side}`);
      const d = side === "top" ? st.y - r.y : side === "bottom" ? r.y + r.h - (st.y + st.h) : side === "left" ? st.x - r.x : r.x + r.w - (st.x + st.w);
      assert.ok(near(d, OS), `${name} ${side} at ${st.w}x${st.h}: ${d}`);
    }
    assert.ok(!JSON.stringify(artLayerStyle(l, st)).includes("env("));
  }
});
test("no rectangle leaves the stage except by the overscan (free layers stay fully inside)", () => {
  for (const st of STAGES) for (const l of Object.values(DECOR_ART).flat()) {
    const r = computeDecorRect(l, st)!;
    assert.ok(r.x >= st.x - OS - 1e-9 && r.y >= st.y - OS - 1e-9, `${nameOf(l)} top-left`);
    assert.ok(r.x + r.w <= st.x + st.w + OS + 1e-9 && r.y + r.h <= st.y + st.h + OS + 1e-9, `${nameOf(l)} bottom-right ${st.w}x${st.h}`);
  }
});
test("stretch stays within the limits for phone stages and wide screens; tree keeps its aspect at the full stage height", () => {
  for (const st of [...STAGES, { x: 0, y: 80, w: 820, h: 1000 }, { x: 0, y: 80, w: 1280, h: 650 }]) for (const l of Object.values(DECOR_ART).flat().filter((x) => x.stretch)) {
    const r = computeDecorRect(l, st)!, k = r.w / r.h / l.aspect;
    assert.ok(k >= 1 - l.maxStretch! - 1e-9 && k <= 1 + l.maxStretch! + 1e-9, `${l.src} ${st.w}x${st.h} ratio ${k}`);
  }
  for (const st of STAGES) {
    const t = computeDecorRect(DECOR_ART.autumn[0], st)!;
    assert.ok(near(t.w / t.h, DECOR_ART.autumn[0].aspect));
    assert.ok(near(t.h, st.h + 2 * OS));   // crown at the stage top, rocks on the tab bar edge
    assert.ok(near(t.y, st.y - OS) && near(t.x, st.x - OS));
    assert.ok(t.w <= st.w, "tree not wider than the stage");
  }
});
test("layer sizes in % of the stage: wave 14 % high (stretch may add), meadow 10 %, clouds 14 %, full stage width", () => {
  for (const st of STAGES) {
    for (const [l, pct] of [[DECOR_ART.summer[1], 14], [DECOR_ART.spring[0], 10], [DECOR_ART.winter[0], 14]] as const) {
      const r = computeDecorRect(l, st)!;
      assert.ok(near(r.w, st.w + 2 * OS));
      assert.ok(r.h >= (st.h * pct) / 100 - 1e-9 && r.h <= (st.h * pct * 1.5) / 100, `${nameOf(l)} ${st.w}x${st.h} h ${r.h}`);
    }
    assert.equal(DECOR_ART.summer[1].anchor, "bottom-right");
  }
});
test("sun: top-right of the stage, about 30 % wide, 3 % below the stage top, fully inside, clear of the top-left icon row", () => {
  for (const st of STAGES) {
    const l = DECOR_ART.summer[0], r = computeDecorRect(l, st)!;
    assert.equal(l.anchor, "top-right");
    assert.ok(near(r.w / st.w, 0.3));
    assert.ok(near((r.y - st.y) / st.h, 0.03));
    assert.ok(r.x >= st.x && r.x + r.w <= st.x + st.w && r.y >= st.y && r.y + r.h <= st.y + st.h);
    const icons = { x: st.x + HIT_ICON_ZONE.x, y: st.y + HIT_ICON_ZONE.y, w: HIT_ICON_ZONE.w, h: HIT_ICON_ZONE.h };
    assert.ok(r.x >= icons.x + icons.w, "sun right of the icon row");
  }
});
test("not measured yet (stage 0) = no rectangle", () => {
  assert.equal(computeDecorRect(DECOR_ART.spring[0], { x: 0, y: 0, w: 0, h: 0 }), null);
});
test("art clip: nothing cut at rest, only the border to a neighbour moves", () => {
  assert.deepEqual(artClip(3, 3 * 800, 800, 50, 900), { top: 0, bottom: 0 });
  assert.equal(artClip(2, 3 * 800, 800, 50, 900), null);
  assert.deepEqual(artClip(3, 3 * 800 + 200, 800, 50, 900), { top: 0, bottom: 900 - (50 + 600) });   // swiping to the next: this outfit's bottom edge rises
  assert.deepEqual(artClip(4, 3 * 800 + 200, 800, 50, 900), { top: 50 + 600, bottom: 0 });
});
test("?decor parameter: pixel only on 'pixel'", () => {
  assert.equal(parseDecorMode("pixel"), "pixel");
  assert.equal(parseDecorMode("art"), "art");
  assert.equal(parseDecorMode(null), "art");
  assert.equal(parseDecorMode("x"), "art");
});
test("layer order: stripe < background picture < decoration < figure < products < header/tab bar", () => {
  assert.ok(LAYER_Z.stripe < LAYER_Z.image);
  assert.ok(LAYER_Z.image < LAYER_Z.decor);
  assert.ok(LAYER_Z.decor < LAYER_Z.figure);
  assert.ok(LAYER_Z.figure < LAYER_Z.products);
  assert.ok(LAYER_Z.products < LAYER_Z.chrome);
});

test("autumn sprite: full tree, no top fade or cut (content touches the top row), aspect = file", async () => {
  const sharp = await import("node:fs").then((f) => f.readFileSync("public/season-decor/autumn_tree.webp"));
  assert.ok(sharp.length > 1000);
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("python3", ["-I", "-c", "import sys;from PIL import Image;import numpy as np;a=np.array(Image.open(sys.argv[1]).split()[3]);print(a[:2].max(),a[:,:2].max(),a[-2:].max(),a.shape[1]/a.shape[0])", "public/season-decor/autumn_tree.webp"]).toString().trim().split(" ");
  assert.ok(Number(out[0]) >= 200, "top row opaque (no fade)");
  assert.ok(Number(out[1]) >= 200, "trunk touches the left edge");
  assert.ok(Number(out[2]) >= 200, "bottom row opaque");
  assert.ok(Math.abs(Number(out[3]) / DECOR_ART.autumn[0].aspect - 1) < 0.01);
});

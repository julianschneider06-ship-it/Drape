#!/usr/bin/env python3
"""Builds the seasonal decoration sprites (public/season-decor/*.webp) from docs/reference/season-decor-source/*.png (5 illustrations on white).
Plain Python (Pillow + numpy; sharp is not installed), outside the type-checked scripts. Run: python3 -I scripts/build-season-decor.py [--preview DIR]
Method: (1) flood-fill from the image borders over connected near-white pixels (TOL = max channel distance to white) = background; enclosed pale
pixels (foam, snowflake cores, daisies) are never touched because they are not connected to the border through near-white. (2) Alpha ramp on the
pixels next to the background (BAND px): alpha = smoothstep((distance to white - RAMP_LO) / (RAMP_HI - RAMP_LO)). (3) Un-matte against white:
c = (c - (1-a)*255) / a, clamped, so no white halo shows on coloured backgrounds. (4) trim, resize to MAX_EDGE, WebP with alpha.
Post steps (Prompt 83/84): winter_clouds is split into winter_clouds (the big cloud shapes) and winter_flakes (everything small: snowflakes + dots) so the flakes get their
own, smaller scale in the config; summer_wave gets a soft alpha fade over its left WAVE_FADE share so it has no vertical left edge on screen."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "docs/reference/season-decor-source"
OUT = "public/season-decor"
MAX_EDGE = 1400
WAVE_FADE = 0.0       # (Prompt 84: no left fade any more, the wave is stretched to the full screen width and must touch the left edge)
TREE_TOP_FADE = 0.10  # share of the tree's height (from the top) that fades out: the illustration is cut at its top edge, at 60% screen height that would be a straight line
CLOUD_MIN_PX = 20000  # winter: connected shapes (after closing small gaps) with at least this many px are clouds, smaller ones flakes
# tol: border flood-fill tolerance (max channel distance to white); lo/hi: alpha ramp on the edge band (distance to white); band: edge band width in px
SPRITES = {
    "summer_sun": dict(tol=14, lo=10, hi=60, band=3),
    "summer_wave": dict(tol=14, lo=10, hi=60, band=3),
    "spring_meadow": dict(tol=14, lo=10, hi=60, band=3),
    "autumn_tree": dict(tol=14, lo=10, hi=60, band=3, holes=40),   # holes: also clear ENCLOSED near-white regions of >= this many px (sky between branches)
    "winter_clouds": dict(tol=10, lo=6, hi=50, band=2),   # fine dots / pale snowflakes: stricter fill, softer ramp
}

def background(rgb, tol, holes=0):
    """True where connected (4-neighbourhood) to the image border through near-white pixels; with holes > 0 also enclosed near-white regions >= holes px"""
    h, w, _ = rgb.shape
    near = ((255 - rgb).max(2) <= tol).ravel().tolist()
    seen = bytearray(h * w)
    def fill(stack):
        got = []
        while stack:
            i = stack.pop()
            if seen[i] or not near[i]: continue
            seen[i] = 1; got.append(i)
            x = i % w
            if x > 0: stack.append(i - 1)
            if x < w - 1: stack.append(i + 1)
            if i >= w: stack.append(i - w)
            if i < (h - 1) * w: stack.append(i + w)
        return got
    st = []
    for x in range(w): st += [x, (h - 1) * w + x]
    for y in range(h): st += [y * w, y * w + w - 1]
    fill(st)
    if holes:
        for i in range(h * w):
            if near[i] and not seen[i]:
                comp = fill([i])
                if len(comp) < holes:
                    for j in comp: seen[j] = 0     # small enclosed white (foam, highlights) stays opaque
    return np.frombuffer(bytes(seen), dtype=np.uint8).reshape(h, w) == 1

def key(rgb, o):
    bg = background(rgb, o["tol"], o.get("holes", 0))
    grown = np.array(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * o["band"] + 1))) > 127
    band = grown & ~bg
    d = (255 - rgb).max(2)
    r = np.clip((d - o["lo"]) / (o["hi"] - o["lo"]), 0, 1)
    r = r * r * (3 - 2 * r)
    a = np.where(bg, 0.0, np.where(band, r, 1.0))
    af = np.maximum(a, 1e-3)[..., None]
    f = np.clip((rgb - (1 - a[..., None]) * 255) / af, 0, 255)
    return np.where(a[..., None] >= 0.999, rgb, f), a

def components(mask):
    """4-connected components of a boolean mask -> label array (0 = none), plain Python flood fill (no scipy)"""
    h, w = mask.shape
    m = mask.ravel().tolist(); lab = [0] * (h * w); n = 0
    for s0 in range(h * w):
        if not m[s0] or lab[s0]: continue
        n += 1; st = [s0]
        while st:
            i = st.pop()
            if lab[i] or not m[i]: continue
            lab[i] = n; x = i % w
            if x > 0: st.append(i - 1)
            if x < w - 1: st.append(i + 1)
            if i >= w: st.append(i - w)
            if i < (h - 1) * w: st.append(i + w)
    return np.array(lab).reshape(h, w), n

def split_winter(img):
    a = np.array(img.getchannel("A"))
    closed = np.array(Image.fromarray(((a > 8) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 127
    lab, n = components(closed)
    big = np.zeros(n + 1, bool)
    for k, c in enumerate(np.bincount(lab.ravel(), minlength=n + 1)):
        big[k] = k > 0 and c >= CLOUD_MIN_PX
    cloud = big[lab]
    px = np.array(img); out = []
    for keep in (cloud, ~cloud):
        q = px.copy(); q[..., 3] = np.where(keep, q[..., 3], 0)
        im = Image.fromarray(q, "RGBA"); out.append(im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()))
    return out

def fade_left(img, share):
    q = np.array(img).astype(float); w = q.shape[1]; k = max(1, int(w * share))
    ramp = np.clip(np.arange(w) / k, 0, 1); ramp = ramp * ramp * (3 - 2 * ramp)
    q[..., 3] *= ramp[None, :]
    return Image.fromarray(q.astype(np.uint8), "RGBA")

def fade_top(img, share):
    q = np.array(img).astype(float); h = q.shape[0]; k = max(1, int(h * share))
    ramp = np.clip(np.arange(h) / k, 0, 1); ramp = ramp * ramp * (3 - 2 * ramp)
    q[..., 3] *= ramp[:, None]
    return Image.fromarray(q.astype(np.uint8), "RGBA")

def main():
    prev = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    for name, o in SPRITES.items():
        rgb = np.array(Image.open(f"{SRC}/{name}.png").convert("RGB")).astype(float)
        f, a = key(rgb, o)
        img = Image.fromarray(np.dstack([f, a * 255]).astype(np.uint8), "RGBA")
        bb = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        img = img.crop(bb)
        if max(img.size) > MAX_EDGE:
            s = MAX_EDGE / max(img.size); img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        parts = {name: img}
        if name == "winter_clouds": parts = dict(zip(("winter_clouds", "winter_flakes"), split_winter(img)))
        if name == "summer_wave" and WAVE_FADE > 0: parts = {name: fade_left(img, WAVE_FADE)}
        if name == "autumn_tree": parts = {name: fade_top(img, TREE_TOP_FADE)}
        for nm, im in parts.items():
            im.save(f"{OUT}/{nm}.webp", "WEBP", quality=88, alpha_quality=95, method=6)
            print(nm, im.size)
            if prev:
                for tag, col in (("white", (255, 255, 255)), ("grey", (128, 128, 128)), ("dark", (20, 40, 90))):
                    b = Image.new("RGBA", im.size, col + (255,)); b.alpha_composite(im); b.convert("RGB").save(f"{prev}/{nm}_{tag}.png")

main()

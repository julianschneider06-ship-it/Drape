#!/usr/bin/env python3
"""Builds the seasonal decoration sprites (public/season-decor/*.webp) from docs/reference/season-decor-source/*.png (5 illustrations on white).
Plain Python (Pillow + numpy; sharp is not installed), outside the type-checked scripts. Run: python3 -I scripts/build-season-decor.py [--preview DIR]
Method: (1) flood-fill from the image borders over connected near-white pixels (TOL = max channel distance to white) = background; enclosed pale
pixels (foam, snowflake cores, daisies) are never touched because they are not connected to the border through near-white. (2) Alpha ramp on the
pixels next to the background (BAND px): alpha = smoothstep((distance to white - RAMP_LO) / (RAMP_HI - RAMP_LO)). (3) Un-matte against white:
c = (c - (1-a)*255) / a, clamped, so no white halo shows on coloured backgrounds. (4) trim, resize to MAX_EDGE, WebP with alpha."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "docs/reference/season-decor-source"
OUT = "public/season-decor"
MAX_EDGE = 1400
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
        img.save(f"{OUT}/{name}.webp", "WEBP", quality=88, alpha_quality=95, method=6)
        print(name, img.size)
        if prev:
            for tag, col in (("white", (255, 255, 255)), ("grey", (128, 128, 128)), ("dark", (20, 40, 90))):
                b = Image.new("RGBA", img.size, col + (255,)); b.alpha_composite(img); b.convert("RGB").save(f"{prev}/{name}_{tag}.png")

main()

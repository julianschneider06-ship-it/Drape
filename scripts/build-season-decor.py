#!/usr/bin/env python3
"""Builds the seasonal decoration sprites (public/season-decor/*.webp) from docs/reference/season-decor-source.png.
Plain Python (Pillow + numpy; sharp is not installed), outside the type-checked scripts. Run: python3 -I scripts/build-season-decor.py [--preview DIR]
Method: per panel, fit a smooth background (2nd-order polynomial per channel, robust), alpha = soft ramp of the colour distance to it
(ALPHA_LOW..ALPHA_HIGH), de-matte (F = (C - (1-a)B) / a) so no blue halo stays, optional luminance cap so pale motifs stay visible on white."""
import sys
import numpy as np
from PIL import Image
from PIL import ImageFilter, ImageDraw

SRC = "docs/reference/season-decor-source.png"
OUT = "public/season-decor"
ALPHA_LOW, ALPHA_HIGH = 16.0, 46.0        # colour distance (RGB, 0..255) where alpha starts / reaches 1
MAX_EDGE = 1400
PANELS = {"summer": (0, 0, 540, 721), "spring": (545, 0, 1085, 721), "autumn": (0, 725, 540, 1447), "winter": (545, 725, 1085, 1447)}
# name: panel, crop (x0,y0,x1,y1 inside the panel), options
SPRITES = {
    "summer_sun": dict(panel="summer", crop=(0, 0, 540, 330)),
    "summer_wave": dict(panel="summer", crop=(0, 500, 540, 721), solid=True, lo=12.0, hi=30.0),
    "spring_meadow": dict(panel="spring", crop=(0, 520, 540, 721)),
    "autumn_tree": dict(panel="autumn", crop=(0, 0, 540, 722)),
    "winter_clouds": dict(panel="winter", crop=(0, 0, 540, 260), maxlum=0.80),
}

def blur(a, r):
    k = np.arange(-int(3 * r) - 1, int(3 * r) + 2)
    k = np.exp(-k * k / (2 * r * r)); k /= k.sum()
    p = len(k) // 2
    a = np.pad(a, p, mode="edge")
    a = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, a)

def morph(m, size, grow):
    im = Image.fromarray((m * 255).astype(np.uint8))
    return np.array(im.filter(ImageFilter.MaxFilter(size) if grow else ImageFilter.MinFilter(size))) > 127

def fill_holes(m):
    """pixels of m plus every background pixel NOT connected to the crop edge (propagation by repeated dilation)"""
    free = ~m
    out = np.zeros_like(m)
    out[0, :] = free[0, :]; out[-1, :] = free[-1, :]; out[:, 0] = free[:, 0]; out[:, -1] = free[:, -1]
    while True:
        n = morph(out, 3, True) & free
        if (n == out).all():
            return ~out
        out = n

def bg_model(rgb, mask):
    h, w, _ = rgb.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x, y = xx / w, yy / h
    A = np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1).reshape(-1, 6)
    out = np.zeros_like(rgb, dtype=float)
    m = mask.reshape(-1)
    for c in range(3):
        v = rgb[..., c].reshape(-1)
        coef = np.linalg.lstsq(A[m], v[m], rcond=None)[0]
        out[..., c] = (A @ coef).reshape(h, w)
    return out

def panel_bg(rgb):
    med = np.median(rgb.reshape(-1, 3), 0)
    mask = np.abs(rgb - med).sum(2) < 60
    for _ in range(3):
        bg = bg_model(rgb, mask)
        d = np.sqrt(((rgb - bg) ** 2).sum(2))
        mask = d < 20
    return bg

def key(rgb, bg, o):
    lo, hi = o.get("lo", ALPHA_LOW), o.get("hi", ALPHA_HIGH)
    d = np.sqrt(((rgb - bg) ** 2).sum(2))
    d = blur(d, 0.6)
    a = np.clip((d - lo) / (hi - lo), 0, 1)
    a = a * a * (3 - 2 * a)
    if o.get("solid"):                                  # blue-on-blue: close gaps, fill holes, keep the body opaque
        core = a > 0.35
        for _ in range(3): core = morph(core, 3, True)
        for _ in range(3): core = morph(core, 3, False)
        core = fill_holes(core)
        soft = blur(core.astype(float), 0.8)
        a = np.maximum(a, soft)
    a = np.where(a < 0.02, 0, a)
    af = np.maximum(a, 1e-3)[..., None]
    f = (rgb - (1 - a[..., None]) * bg) / af          # de-matte: removes the blue halo
    f = np.where(a[..., None] > 0.98, rgb, f)
    f = np.clip(f, 0, 255)
    if o.get("solid"):
        f = np.where((a[..., None] > 0.5), np.where(np.sqrt(((rgb - bg) ** 2).sum(2))[..., None] < lo, rgb, f), f)
    if "maxlum" in o:                                  # keep pale motifs visible on a white page
        lum = (f @ np.array([0.2126, 0.7152, 0.0722])) / 255
        s = np.minimum(1, o["maxlum"] / np.maximum(lum, 1e-3))
        f = f * s[..., None]
    return f, a

def main():
    prev = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    src = np.array(Image.open(SRC).convert("RGB")).astype(float)
    bgs, tiles = {}, {}
    for k, (x0, y0, x1, y1) in PANELS.items():
        t = src[y0 + 3:y1 - 2, x0 + 3:x1 - 2]
        tiles[k] = t
    for name, o in SPRITES.items():
        t = tiles[o["panel"]]
        if o["panel"] not in bgs:
            bgs[o["panel"]] = panel_bg(t)
        x0, y0, x1, y1 = o["crop"]
        rgb, bg = t[y0:y1, x0:x1], bgs[o["panel"]][y0:y1, x0:x1]
        f, a = key(rgb, bg, o)
        # clear the 2px border strip of the panel (separator / vignette) on sides that touch the panel edge
        img = Image.fromarray(np.dstack([f, a * 255]).astype(np.uint8), "RGBA")
        bb = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        img = img.crop(bb)
        if max(img.size) > MAX_EDGE:
            s = MAX_EDGE / max(img.size); img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        img.save(f"{OUT}/{name}.webp", "WEBP", quality=88, alpha_quality=95, method=6)
        print(name, img.size)
        if prev:
            for tag, col in (("white", (255, 255, 255)), ("grey", (128, 128, 128)), ("dark", (30, 30, 36))):
                b = Image.new("RGBA", img.size, col + (255,)); b.alpha_composite(img); b.convert("RGB").save(f"{prev}/{name}_{tag}.png")

main()

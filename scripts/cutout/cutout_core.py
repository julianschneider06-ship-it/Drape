"""Background removal core: image bytes -> (transparent WebP bytes | None, metrics, reason). Pure functions, no network/DB.

Model: any rembg-compatible ONNX segmentation model, run on CPU through onnxruntime (free, open source, on our side).
Steps: segmentation -> alpha cleanup (fragments, tiny holes, edge halo) -> sanity score -> crop to content -> resize -> WebP.
"""
import io
import time
import numpy as np
import cv2
from PIL import Image

MAX_SIDE = 900          # longest side of the stored cutout
PAD = 0.015             # breathing room around the content bbox (fraction of the larger side)
WEBP_QUALITY = 88
# Per-slot limits for the sanity guard.
LIMITS = {
    "shoes":     dict(min_area=0.02, max_area=0.80, max_frag=3, min_recall=0.88),
    "bottom":    dict(min_area=0.02, max_area=0.90, max_frag=2, min_recall=0.88),
    "top":       dict(min_area=0.02, max_area=0.90, max_frag=2, min_recall=0.88),
    "full_body": dict(min_area=0.02, max_area=0.90, max_frag=2, min_recall=0.88),
}


def load_session(model: str, threads: int = 1):
    import onnxruntime as ort
    from rembg import new_session
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    return new_session(model, providers=["CPUExecutionProvider"], sess_opts=so)


def segment(session, img: Image.Image) -> np.ndarray:
    """Alpha matte 0..1 (float32), same size as img."""
    from rembg import remove
    m = remove(img, session=session, only_mask=True, post_process_mask=False)
    return np.asarray(m, dtype=np.float32) / 255.0


def _components(binary: np.ndarray):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(binary.astype(np.uint8), connectivity=8)
    return n, lab, stats


def clean_alpha(a: np.ndarray, rgb: np.ndarray):
    """Drop stray fragments and tiny holes, tighten the edge so no backdrop halo remains."""
    h, w = a.shape
    b = a > 0.5
    n, lab, st = _components(b)
    if n <= 1:
        return a, 0, 0.0
    areas = st[1:, cv2.CC_STAT_AREA]
    big = areas.max()
    keep = np.zeros(n, bool)
    keep[1:] = areas >= max(0.03 * big, 0.0004 * h * w)     # keeps a pair of shoes, drops specks and strings
    frags = int(keep.sum())
    fg = keep[lab]
    # fill small holes (not strap gaps / big openings): background regions fully enclosed by the foreground and tiny
    inv = (~fg).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    hole_area = 0
    bd = backdrop_dist(rgb)
    for i in range(1, n2):
        x, y, ww, hh, ar = st2[i]
        touches = x == 0 or y == 0 or x + ww == w or y + hh == h
        if not touches:
            sel = lab2 == i
            if ar < 0.0015 * h * w:
                fg[sel] = True
            elif (bd[sel] > 40).mean() > 0.3:       # enclosed region that is NOT backdrop-coloured: the model dropped product pixels
                hole_area += ar                     # (real gaps between straps / laces show the backdrop and are fine)
    # soft edge from the model, limited to the cleaned region, slightly eroded to drop the backdrop halo
    soft = np.clip((a - 0.12) / 0.76, 0, 1)
    grown = cv2.dilate(fg.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    soft = np.where(grown, soft, 0)
    core = cv2.erode(fg.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2).astype(bool)
    soft = np.where(core, 1.0, soft)                                   # inside the kept shape never see-through
    soft = cv2.GaussianBlur(soft, (0, 0), 0.7)
    hole_ratio = hole_area / max(1, int(fg.sum()) + hole_area)
    return soft.astype(np.float32), frags, float(hole_ratio)


def backdrop_dist(rgb: np.ndarray) -> np.ndarray:
    """Per-pixel colour distance to the backdrop colour (median of the outer ring)."""
    h, w, _ = rgb.shape
    r = max(2, int(min(h, w) * 0.02))
    ring = np.concatenate([rgb[:r].reshape(-1, 3), rgb[-r:].reshape(-1, 3), rgb[:, :r].reshape(-1, 3), rgb[:, -r:].reshape(-1, 3)])
    med = np.median(ring, axis=0)
    return np.abs(rgb.astype(np.int16) - med.astype(np.int16)).max(axis=2)


def backdrop_evidence(rgb: np.ndarray):
    """Pixels strongly different from the backdrop (shadows and soft gradients stay below) -> where product pixels surely are."""
    return backdrop_dist(rgb) > 90


def sanity(slot: str, rgb: np.ndarray, a_raw: np.ndarray, a: np.ndarray, frags: int, hole_ratio: float, skip_recall: bool = False):
    """Returns (quality 0..1, reason or None, metrics)."""
    L = LIMITS[slot]
    h, w = a.shape
    fg = a > 0.5
    area = float(fg.mean())
    m = dict(area=round(area, 3), frags=frags, holes=round(hole_ratio, 3))
    if area < 0.002:
        return 0.0, "empty_mask", m
    # border touching: share of each image edge that the foreground occupies
    edge = max(fg[0].mean(), fg[-1].mean(), fg[:, 0].mean(), fg[:, -1].mean())
    m["border"] = round(float(edge), 3)
    # uncertainty: share of undecided pixels in the raw matte
    mid = float(((a_raw > 0.15) & (a_raw < 0.85)).sum() / max(1, (a_raw > 0.15).sum()))
    m["uncertain"] = round(mid, 3)
    # recall of clearly-non-backdrop pixels (cut-off laces / soles / sleeves / straps show up here)
    ev = backdrop_evidence(rgb)
    ev_share = float(ev.mean())
    recall = float((ev & fg).sum() / max(1, ev.sum())) if ev_share > 0.02 and not skip_recall else 1.0
    m["recall"] = round(recall, 3)
    reason = None
    if area < L["min_area"]: reason = "too_small"
    elif area > L["max_area"]: reason = "mask_is_whole_image"
    elif frags > L["max_frag"]: reason = "fragments"
    elif edge > 0.10: reason = "touches_border"
    elif hole_ratio > 0.10: reason = "holes"
    elif recall < L["min_recall"]: reason = "cut_off"
    elif mid > 0.55: reason = "uncertain_edges"
    q = 1.0 - min(1.0, 0.5 * max(0, 0.95 - recall) / 0.25 + 0.2 * mid + 0.2 * hole_ratio + 0.1 * max(0, frags - 1) + 0.5 * max(0, edge - 0.02))
    return round(max(0.0, q), 3), reason, m


def render(img_rgb: np.ndarray, a: np.ndarray):
    """Crop to the content bbox, resize, return (RGBA PIL image, aspect)."""
    ys, xs = np.where(a > 0.05)
    h, w = a.shape
    pad = int(PAD * max(h, w))
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(h, ys.max() + 1 + pad), max(0, xs.min() - pad), min(w, xs.max() + 1 + pad)
    rgba = np.dstack([img_rgb, (a * 255 + 0.5).astype(np.uint8)])[y0:y1, x0:x1]
    im = Image.fromarray(rgba, "RGBA")
    s = MAX_SIDE / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im, im.width / im.height


def process(session, slot: str, data: bytes):
    """-> dict(webp=bytes|None, aspect, quality, reason, metrics, ms). webp is None when the sanity guard fails."""
    t0 = time.time()
    img = Image.open(io.BytesIO(data))
    native_alpha = None
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        al = np.asarray(rgba.split()[3], dtype=np.float32) / 255.0
        if (al < 0.1).mean() > 0.05:        # the shop already delivers a transparent cutout: reuse it, no model needed
            native_alpha = al
        bg = Image.new("RGB", img.size, (255, 255, 255)); bg.paste(rgba, mask=rgba.split()[3]); img = bg
    img = img.convert("RGB")
    if max(img.size) > 1100:
        s = 1100 / max(img.size)
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        if native_alpha is not None:
            native_alpha = cv2.resize(native_alpha, img.size, interpolation=cv2.INTER_AREA)
    rgb = np.asarray(img)
    a_raw = native_alpha if native_alpha is not None else segment(session, img)
    a, frags, hole_ratio = clean_alpha(a_raw, rgb)
    q, reason, m = sanity(slot, rgb, a_raw, a, frags, hole_ratio, skip_recall=native_alpha is not None)
    m["native_alpha"] = native_alpha is not None
    out = dict(webp=None, aspect=None, quality=q, reason=reason, metrics=m)
    if (a > 0.5).sum() > 50:
        im, aspect = render(rgb, a)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=WEBP_QUALITY, method=4, exact=True)
        out.update(aspect=aspect, image=im)
        if reason is None:
            out["webp"] = buf.getvalue()
            out["bytes"] = len(out["webp"])
    out["ms"] = int((time.time() - t0) * 1000)
    return out

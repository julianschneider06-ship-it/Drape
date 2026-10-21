"""Measurements of a cutout's alpha mask for the rule-based outfit layout. Pure functions.

All results are ratios of the cutout bounding-box width, so they do not depend on the file's resolution:
- hem_ratio (tops / outerwear): body width in a band just above the body's lower edge (the lowest row where the centre line is
  garment, so sleeves/cuffs hanging lower are ignored); per row only the run of pixels containing the centre line counts
  (sleeves separated by a gap are excluded); median over the band rows (robust).
- waist_ratio (bottoms): same at the upper edge (rows 2%-10% below the highest centre-line row).
- shape_fill: mask area / bounding-box area (folded garments are compact rectangles, spread ones have sleeves / legs).
"""
import io
import numpy as np
from PIL import Image

HEM_BAND = (0.06, 0.01)     # rows above the lowest centre-line row of the body, as fraction of the bbox height (from, to)
WAIST_BAND = (0.02, 0.10)   # rows below the highest centre-line row
MIN_ROWS_OK = 0.6        # share of band rows that must have a usable central run
MAX_SPREAD = 0.25        # (p75 - p25) / median of the band widths; larger = unstable edge, not measured
RATIO_RANGE = (0.25, 1.0)


def _central_run_width(row: np.ndarray, cx: int) -> int:
    """Length of the run of True values that contains (or is nearest to) column cx; 0 if the row is empty."""
    if not row.any():
        return 0
    padded = np.concatenate(([False], row, [False]))
    d = np.diff(padded.astype(np.int8))
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
    inside = np.where((starts <= cx) & (ends > cx))[0]
    if len(inside):
        i = inside[0]
    else:  # centre line falls in a gap: take the run closest to the centre
        i = int(np.argmin(np.minimum(np.abs(starts - cx), np.abs(ends - cx))))
    return int(ends[i] - starts[i])


def _band(mask: np.ndarray, slot: str):
    """Rows of the band to measure, anchored at the BODY edge: the lowest (tops) / highest (bottoms) row in which the garment's
    centre line is foreground. This ignores sleeves and cuffs that hang lower than the body hem."""
    h, w = mask.shape
    cx = w // 2
    col = mask[:, max(0, cx - 1):cx + 2].any(axis=1)
    rows = np.where(col)[0]
    if not len(rows):
        return 0, 1, []
    if slot == "top":
        edge = int(rows.max())
        y0, y1 = edge - int(round(HEM_BAND[0] * h)), edge - int(round(HEM_BAND[1] * h))
    else:
        edge = int(rows.min())
        y0, y1 = edge + int(round(WAIST_BAND[0] * h)), edge + int(round(WAIST_BAND[1] * h))
    y0, y1 = max(0, y0), min(h, max(y1, y0 + 1))
    return y0, y1, [_central_run_width(mask[y], cx) for y in range(y0, y1)]


def measure(slot: str, data: bytes):
    """-> dict(status, reason, hem, waist, fill, lines) ; lines = debug geometry in bbox-relative coordinates."""
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    a = np.asarray(im)[:, :, 3] > 127
    ys, xs = np.where(a)
    if len(ys) < 100:
        return dict(status="failed", reason="empty", hem=None, waist=None, fill=None, lines=None)
    m = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = m.shape
    out = dict(status="ok", reason=None, hem=None, waist=None, fill=round(float(m.mean()), 4), lines={})
    if slot == "full_body":
        return out
    y0, y1, widths = _band(m, slot)
    good = [x for x in widths if x > 0]
    if len(good) < MIN_ROWS_OK * max(1, len(widths)):
        return dict(out, status="failed", reason="band_empty")
    med = float(np.median(good))
    q1, q3 = np.percentile(good, [25, 75])
    if med <= 0 or (q3 - q1) / med > MAX_SPREAD:
        return dict(out, status="failed", reason="unstable")
    ratio = med / im.width   # relative to the cutout FILE width (content + 1.5% padding), which is the box the feed draws
    if not (RATIO_RANGE[0] <= ratio <= RATIO_RANGE[1]):
        return dict(out, status="failed", reason="out_of_range")
    key = "hem" if slot == "top" else "waist"
    out[key] = round(ratio, 4)
    out["lines"] = dict(y0=y0 / h, y1=y1 / h, ratio=ratio, aspect=im.width / im.height, tight=w / im.width)
    return out

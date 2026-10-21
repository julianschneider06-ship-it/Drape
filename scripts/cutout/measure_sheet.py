"""Contact sheet of measurement spot-checks. Usage: measure_sheet.py OUT.jpg SLOT path1 path2 ... (paths relative to the cutouts bucket)"""
import io, sys, os
import numpy as np, requests
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import measure_core as M
B = "https://ntknoxzhljktxhsbudlr.supabase.co/storage/v1/object/public/cutouts/"
out, slot, paths = sys.argv[1], sys.argv[2], sys.argv[3:]
TH, cols = 230, 6
sheet = Image.new("RGB", (cols * TH, ((len(paths) + cols - 1) // cols) * TH), "white")
for i, p in enumerate(paths):
    data = requests.get(B + p, timeout=30).content
    r = M.measure(slot, data)
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    a = np.asarray(im)[:, :, 3] > 127
    ys, xs = np.where(a); im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    bg = Image.new("RGBA", im.size, (235, 235, 235, 255)); bg.alpha_composite(im); im = bg.convert("RGB")
    w, h = im.size; s = (TH - 30) / max(w, h); im = im.resize((max(1, int(w * s)), max(1, int(h * s)))); w2, h2 = im.size
    d = ImageDraw.Draw(im)
    key = "hem" if slot == "top" else "waist"
    L = r.get("lines") or {}
    if L:
        for yy in (L["y0"], L["y1"]):
            d.line([(0, yy * h2), (w2, yy * h2)], fill=(0, 140, 255))
        mid = w2 / 2; half = L["ratio"] * w2 / 2
        ym = (L["y0"] + L["y1"]) / 2 * h2
        d.line([(mid - half, ym), (mid + half, ym)], fill=(255, 0, 0), width=3)
    x, y = (i % cols) * TH, (i // cols) * TH
    sheet.paste(im, (x + (TH - w2) // 2, y + 24))
    ImageDraw.Draw(sheet).text((x + 4, y + 4), f"{p.split('/')[-1][:12]} {r['status']} {r.get(key) or r['reason'] or ''}", fill="red")
sheet.save(out, quality=78)

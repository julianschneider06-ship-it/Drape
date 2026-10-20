"""Compare segmentation models on a test set: speed + quality metrics + contact sheets. Usage: model_test.py MODEL TESTSET.json OUTDIR"""
import sys, json, io, time, os, concurrent.futures as cf
import requests
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import cutout_core as C

model, testset, out = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
os.makedirs(out, exist_ok=True)
def dl(it):
    u = it["url"] + ("&" if "?" in it["url"] else "?") + "width=1000"
    try:
        r = requests.get(u, timeout=30); r.raise_for_status(); return r.content
    except Exception:
        return None
items = [(slot, it) for slot, l in testset.items() for it in l]
with cf.ThreadPoolExecutor(16) as ex: datas = list(ex.map(lambda x: dl(x[1]), items))
items = [i for i, d in zip(items, datas) if d]; datas = [d for d in datas if d]
t = time.time(); sess = C.load_session(model, threads=int(os.environ.get("THREADS", "2"))); print("load", round(time.time() - t, 1), "s", flush=True)
rows = []
for (slot, it), data in zip(items, datas):
    r = C.process(sess, slot, data); r.update(id=it["id"], slot=slot, orig=data); rows.append(r)
ms = sorted(r["ms"] for r in rows)
print(model, "n", len(rows), "median ms", ms[len(ms) // 2], "mean ms", sum(ms) // len(ms), "max", ms[-1])
from collections import Counter
for slot in ("shoes", "top", "bottom"):
    rs = [r for r in rows if r["slot"] == slot]
    print(slot, "ok", sum(r["reason"] is None for r in rs), "of", len(rs), dict(Counter(r["reason"] for r in rs if r["reason"])))
# contact sheets: per row  original | on white | on grey ; 5 items per sheet row-block
TH = 230
def flat(im):
    im = im.convert("RGBA"); bg = Image.new("RGB", im.size, "white"); bg.paste(im, mask=im.split()[3]); return bg
def fit(im, bg):
    c = Image.new("RGB", (TH, TH), bg); im = im.copy(); im.thumbnail((TH - 8, TH - 8))
    if im.mode == "RGBA": c.paste(im, ((TH - im.width) // 2, (TH - im.height) // 2), im)
    else: c.paste(im, ((TH - im.width) // 2, (TH - im.height) // 2))
    return c
for slot in ("shoes", "tops_bottoms"):
    rs = [r for r in rows if (r["slot"] == "shoes") == (slot == "shoes")]
    per = 8; page = 0
    for i in range(0, len(rs), per):
        chunk = rs[i:i + per]; sheet = Image.new("RGB", (TH * 3, TH * len(chunk)), "white")
        for j, r in enumerate(chunk):
            sheet.paste(fit(flat(Image.open(io.BytesIO(r["orig"]))), "white"), (0, j * TH))
            cut = r.get("image")
            if cut is not None:
                sheet.paste(fit(cut, "white"), (TH, j * TH)); sheet.paste(fit(cut, (128, 128, 128)), (TH * 2, j * TH))
            d = ImageDraw.Draw(sheet); d.text((4, j * TH + 4), f'{r["id"]} {r["ms"]}ms q={r["quality"]} {r["reason"] or "ok"}', fill="red")
        sheet.save(f"{out}/{model}_{slot}_{page}.jpg", quality=80); page += 1
json.dump([{k: v for k, v in r.items() if k not in ("orig", "image", "webp")} for r in rows], open(f"{out}/{model}.json", "w"))

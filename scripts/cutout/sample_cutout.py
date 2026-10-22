#!/usr/bin/env python3
"""Local cutout check for the images saved by scripts/probe-usable.ts: python sample_cutout.py <dir> [n]. Prints one line per image (cutout ok / reason)."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import cutout_core as C
d = sys.argv[1]; s = C.load_session("isnet-general-use", 2); res = {}
for f in sorted(os.listdir(d), key=lambda x: int(x.split(".")[0]) if x.split(".")[0].isdigit() else 0):
    if not f.endswith(".png"): continue
    r = C.process(s, "accessory", open(os.path.join(d, f), "rb").read()); res[f.split(".")[0]] = r["reason"] or "ok"
print(json.dumps(res))

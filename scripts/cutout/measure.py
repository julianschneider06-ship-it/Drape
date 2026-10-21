#!/usr/bin/env python3
"""Measure cutouts (hem / waist ratios, shape fill) for the rule-based layout. Idempotent: only cutouts not measured yet.
  DRAPE_PIPELINE_TOKEN=... python scripts/cutout/measure.py [--limit N]
"""
import argparse, concurrent.futures as cf, os, sys
import requests

sys.path.insert(0, os.path.dirname(__file__))
import measure_core as M
import worker as W  # gateway helpers


def own_url(u: str) -> str:
    return u  # public Supabase storage URL, read directly (small files)


def one(t):
    r = requests.get(t["url"], timeout=30)
    r.raise_for_status()
    m = M.measure(t["slot"], r.content)
    return dict(id=t["id"], src=t["url"], status=m["status"], reason=m["reason"], hem=m["hem"], waist=m["waist"], fill=m["fill"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=10**9)
    a = ap.parse_args()
    pool = cf.ThreadPoolExecutor(12)
    after, done, ok = 0, 0, 0
    reasons = {}
    while done < a.limit:
        todo = W.rpc("measure_todo", p_after=after, p_limit=200)
        if not todo:
            break
        after = todo[-1]["id"]
        res = []
        for t, f in [(t, pool.submit(one, t)) for t in todo]:
            try:
                res.append(f.result())
            except Exception as e:
                res.append(dict(id=t["id"], src=t["url"], status="failed", reason="error:" + type(e).__name__, hem=None, waist=None, fill=None))
        W.rpc("measure_apply", p_items=res)
        for r in res:
            done += 1
            if r["status"] == "ok":
                ok += 1
            else:
                reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
        print(f"measured {done}, ok {ok}, failed {done - ok} {reasons}", flush=True)
    print("done", done, "ok", ok, reasons)


if __name__ == "__main__":
    main()

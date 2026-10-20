#!/usr/bin/env python3
"""Cutout worker: removes the background of feed images and stores transparent WebPs in Supabase Storage.

  DRAPE_PIPELINE_TOKEN=... python scripts/cutout/worker.py --slot shoes [--shard 0 --shards 4] [--limit N] [--retry-failed]

- Idempotent + resumable: the work list comes from the database (cutout_todo): products without a result for this
  (model, version), or whose feed image changed. Kill it any time; run it again and it continues.
- Parallel: start N processes with --shard i --shards N (disjoint id ranges), each uses 1 inference thread.
- Batched: one RPC for 40 products, parallel downloads/uploads, one RPC to store the results.
- Never in the request path; the web app only reads the finished columns. No paid calls (local ONNX model).
"""
import argparse, concurrent.futures as cf, os, sys, time
import requests

sys.path.insert(0, os.path.dirname(__file__))
import cutout_core as C

MODEL_DEFAULT, VERSION_DEFAULT = "isnet-general-use", 1
GATEWAY = os.environ.get("DRAPE_PIPELINE_URL", "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline")
PUBLIC = GATEWAY.split("/functions/")[0] + "/storage/v1/object/public/cutouts/"
TOKEN = os.environ.get("DRAPE_PIPELINE_TOKEN")
SESSION = requests.Session()


def gateway(body: dict, retries: int = 4):
    for i in range(retries):
        try:
            r = SESSION.post(GATEWAY, json=body, headers={"authorization": f"Bearer {TOKEN}"}, timeout=90)
            if r.status_code >= 500 and i < retries - 1:
                raise RuntimeError(r.text[:200])
            r.raise_for_status()
            return r.json()
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(2 * 2 ** i)


def rpc(fn, **args):
    return gateway({"action": "rpc", "fn": fn, "args": args})["data"]


def download(url: str) -> bytes:
    u = url + ("&" if "?" in url else "?") + "width=1000" if "cdn.shopify.com" in url else url
    for i in range(3):
        try:
            r = requests.get(u, timeout=30, headers={"user-agent": "Mozilla/5.0 (drape-cutout)"})
            r.raise_for_status()
            return r.content
        except Exception:
            if i == 2:
                raise
            time.sleep(1 + i)


def upload(path: str, signed_url: str, data: bytes):
    for i in range(3):
        try:
            r = requests.put(signed_url, files={"file": (path.split("/")[-1], data, "image/webp")}, data={"cacheControl": "31536000"},
                             headers={"x-upsert": "true"}, timeout=60)
            r.raise_for_status()
            return
        except Exception:
            if i == 2:
                raise
            time.sleep(1 + i)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slot", required=True, choices=list(C.LIMITS))
    ap.add_argument("--model", default=MODEL_DEFAULT)
    ap.add_argument("--version", type=int, default=VERSION_DEFAULT)
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--shards", type=int, default=1)
    ap.add_argument("--batch", type=int, default=40)
    ap.add_argument("--limit", type=int, default=10**9)
    ap.add_argument("--threads", type=int, default=1, help="inference threads per process")
    ap.add_argument("--retry-failed", action="store_true")
    a = ap.parse_args()
    if not TOKEN:
        sys.exit("DRAPE_PIPELINE_TOKEN is not set")
    sess = C.load_session(a.model, a.threads)
    pool = cf.ThreadPoolExecutor(12)
    t0, done, ok, failed, after = time.time(), 0, 0, 0, 0
    reasons = {}
    errors = 0
    while done < a.limit:
        try:
            step = run_batch(a, sess, pool, after)
        except Exception as e:  # transient gateway/network problem: wait and retry the same batch (state lives in the database)
            errors += 1
            print(f"[{a.slot} {a.shard}] batch error {type(e).__name__}: {str(e)[:120]} (#{errors})", flush=True)
            if errors > 8:
                raise
            time.sleep(15)
            continue
        errors = 0
        if step is None:
            break
        after, results = step
        for it in results:
            done += 1
            if it["status"] == "ok":
                ok += 1
            else:
                failed += 1
                reasons[it["reason"]] = reasons.get(it["reason"], 0) + 1
        el = time.time() - t0
        print(f"[{a.slot} {a.shard}/{a.shards}] {done} done, ok {ok}, failed {failed} {reasons}  {el / done:.2f}s/img", flush=True)
    print(f"[{a.slot} {a.shard}/{a.shards}] finished: ok {ok}, failed {failed} {reasons}  {time.time() - t0:.0f}s", flush=True)


def run_batch(a, sess, pool, after):
    """One batch: work list -> download -> segment + guard -> upload -> store. Returns (new cursor, results) or None when empty."""
    todo = rpc("cutout_todo", p_slot=a.slot, p_after=after, p_limit=a.batch, p_model=a.model,
               p_version=a.version, p_shard=a.shard, p_shards=a.shards, p_retry_failed=a.retry_failed)
    if not todo:
        return None
    after = todo[-1]["id"]
    futs = [pool.submit(download, t["url"]) for t in todo]
    results, uploads = [], []
    for t, f in zip(todo, futs):
        item = dict(id=t["id"], model=a.model, version=a.version, src=t["url"], url=None, quality=None, aspect=None, reason=None, status="failed")
        try:
            r = C.process(sess, a.slot, f.result())
            item.update(quality=r["quality"], aspect=r["aspect"], reason=r["reason"])
            if r["webp"] is not None:
                path = f"v{a.version}/{t['id']}.webp"
                item.update(status="ok", url=PUBLIC + path)
                uploads.append((path, r["webp"], item))
        except Exception as e:  # download or decode problem: flagged, never blocks the batch
            item["reason"] = "error:" + type(e).__name__
        results.append(item)
    if uploads:
        urls = {}
        for k in range(0, len(uploads), 10):  # small chunks: the gateway signs sequentially
            urls.update(gateway({"action": "sign_upload", "paths": [u[0] for u in uploads[k:k + 10]]})["urls"])
        futs2 = [(it, pool.submit(upload, p, urls[p], d)) for p, d, it in uploads]
        for it, f in futs2:
            try:
                f.result()
            except Exception:
                it.update(status="failed", url=None, reason="upload_error")
    rpc("cutout_apply", p_items=results)
    return after, results


if __name__ == "__main__":
    main()

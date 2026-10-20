// Pipeline gateway: lets the batch scripts (and the read-only /sample page) talk to the
// database without the service key leaving Supabase. Guarded by a token whose SHA-256 hash is in table pipeline_tokens.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const tokenCache = new Map<string, { info: { label: string; allowed: string[] | null }; at: number }>();

// Token rights are data: pipeline_tokens.allowed_fns (null = everything, else a list of rpc names plus "sample").
async function tokenInfo(req: Request): Promise<{ label: string; allowed: string[] | null } | null> {
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (got.length < 32) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(got));
  const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hit = tokenCache.get(hash);
  if (hit && hit.at > Date.now() - 60_000) return hit.info;   // saves a database round trip per call
  const { data } = await db.from("pipeline_tokens").select("label,allowed_fns").eq("token_hash", hash).maybeSingle();
  const info = data ? { label: data.label as string, allowed: (data.allowed_fns ?? null) as string[] | null } : null;
  if (info) tokenCache.set(hash, { info, at: Date.now() });
  return info;
}

// Callable database functions are data too (table pipeline_rpc_allowlist), cached for a minute.
let fnCache = { fns: new Set<string>(), at: 0 };
async function rpcKnown(fn: string): Promise<boolean> {
  if (fnCache.fns.has(fn)) return true;
  if (Date.now() - fnCache.at > 5000) {
    const { data } = await db.from("pipeline_rpc_allowlist").select("fn");
    fnCache = { fns: new Set((data ?? []).map((r: { fn: string }) => r.fn)), at: Date.now() };
  }
  return fnCache.fns.has(fn);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const info = await tokenInfo(req);
  if (!info) return json({ error: "unauthorized" }, 401);
  const { action, ...a } = await req.json();
  if (info.allowed) {
    const ok = (action === "sample" && info.allowed.includes("sample")) || (action === "rpc" && info.allowed.includes(a.fn));
    if (!ok) return json({ error: "forbidden for this token" }, 403);
  }

  switch (action) {
    case "source_upsert": {
      const { data, error } = await db.from("sources")
        .upsert({ slug: a.slug, name: a.name, kind: a.kind, base_url: a.base_url, config: a.config ?? {} }, { onConflict: "slug" })
        .select("id").single();
      return error ? json({ error: error.message }, 500) : json(data);
    }
    case "run_start": {
      const { data, error } = await db.from("ingestion_runs").insert({ source_id: a.source_id }).select("id").single();
      return error ? json({ error: error.message }, 500) : json(data);
    }
    case "run_last": {
      const { data, error } = await db.from("ingestion_runs").select("id,status,cursor,stats")
        .eq("source_id", a.source_id).order("id", { ascending: false }).limit(1).maybeSingle();
      return error ? json({ error: error.message }, 500) : json({ run: data });
    }
    case "run_progress": {
      const { error } = await db.from("ingestion_runs").update({ cursor: a.cursor ?? {}, stats: a.stats ?? {} }).eq("id", a.run_id);
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }
    case "run_finish": {
      const { error } = await db.from("ingestion_runs").update({
        status: a.status, stats: a.stats ?? {}, cursor: a.cursor ?? {}, error: a.error ?? null, finished_at: new Date().toISOString(),
      }).eq("id", a.run_id);
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }
    case "ingest": {
      const { data, error } = await db.rpc("ingest_batch", { p_source_id: a.source_id, p_run_id: a.run_id, p_items: a.items });
      return error ? json({ error: error.message }, 500) : json(data);
    }
    case "product_get": {
      const { data, error } = await db.from("products").select("id,brand,name,gender,category,colour,primary_image_url").eq("id", a.id).single();
      return error ? json({ error: error.message }, 500) : json({ product: data });
    }
    case "classification_store": {
      // Upsert by (product, taxonomy, model): re-running replaces, never duplicates.
      const c = await db.from("product_classifications").upsert(a.classification, { onConflict: "product_id,taxonomy_version,model" }).select("id").single();
      if (c.error) return json({ error: c.error.message }, 500);
      const e = await db.from("product_embeddings").upsert(a.embedding, { onConflict: "product_id,kind,model,dims" }).select("id").single();
      if (e.error) return json({ error: e.error.message }, 500);
      return json({ classification_id: c.data.id, embedding_id: e.data.id });
    }
    case "rpc": {
      if (typeof a.fn !== "string" || !(await rpcKnown(a.fn))) return json({ error: "function not allowed" }, 403);
      const { data, error } = await db.rpc(a.fn, a.args ?? {});
      return error ? json({ error: error.message }, 500) : json({ data });
    }
    case "sample": {
      // Read-only, cursor-paginated product list for /sample.
      const limit = Math.min(Number(a.limit ?? 48), 100);
      let q = db.from("products")
        .select("id,brand,name,gender,category,colour,primary_image_url,offers(url,price_cents,currency)")
        .eq("status", "active").not("primary_image_url", "is", null)
        .order("id").limit(limit);
      if (a.after) q = q.gt("id", a.after);
      if (a.gender) q = q.eq("gender", a.gender);
      if (a.category) q = q.eq("category", a.category);
      const { data, error } = await q;
      return error ? json({ error: error.message }, 500) : json({ products: data });
    }
    default:
      return json({ error: "unknown action" }, 400);
  }
});

// Pipeline gateway: lets the batch scripts (and the read-only /sample page) talk to the
// database without the service key leaving Supabase. Guarded by a token whose SHA-256 hash is in table pipeline_tokens.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Returns the token's label, or null. Tokens labelled "vercel-*" are read-only (web app).
async function tokenLabel(req: Request): Promise<string | null> {
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (got.length < 32) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(got));
  const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("pipeline_tokens").select("label").eq("token_hash", hash).maybeSingle();
  return data?.label ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const label = await tokenLabel(req);
  if (!label) return json({ error: "unauthorized" }, 401);
  const { action, ...a } = await req.json();
  const readOnlyOk = action === "sample" || (action === "rpc" && a.fn === "review_list");
  if (label.startsWith("vercel") && !readOnlyOk) return json({ error: "forbidden for this token" }, 403);

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
      // Only allow-listed database functions. None of them can reach a paid service.
      const ALLOWED = ["backfill_product_images", "images_todo", "images_apply", "queue_enqueue", "claim_classification_batch",
        "queue_finish", "classify_inputs", "classification_store", "pick_classification_sample", "review_list",
        "store_retry_policy", "refresh_feed_bg"];
      if (!ALLOWED.includes(a.fn)) return json({ error: "function not allowed" }, 403);
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

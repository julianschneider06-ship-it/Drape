// Job runner (POST only). Called every 5 minutes by pg_cron (via pg_net) while a job is open. Rejects anything without the runner secret: the secret exists only in
// Supabase Vault; this route never sees it except in the header, and a wrong value fails inside the database function runner_mint_token. Nothing here costs money
// (no AI, no paid service) and the job allowlist lives in the database (job_requests.job check).
import { after, NextResponse } from "next/server";
import { gatewayRpc } from "@/lib/gateway";
import { clientIp, limited } from "@/lib/ratelimit";
import { rpc, useToken } from "@/ingest/gateway";
import { runRefreshChunk, JOB_LEASE_S } from "@/lib/jobs/refresh-stock";
import { runProbeChunk } from "@/lib/jobs/probe-market";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Shops price by visitor country (Shopify Markets) and the offers were ingested from the US: the runner must also look from the US, not from the app's Dublin region.
export const preferredRegion = "iad1";

export async function POST(req: Request) {
  const secret = req.headers.get("x-runner-secret");
  if (!secret || secret.length > 200) return NextResponse.json({ error: "forbidden" }, { status: 401 });
  if (limited(`runner:${clientIp(req)}`, 12, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  let token: string;
  try { token = await gatewayRpc<string>("runner_mint_token", { p_secret: secret }, { retry: false }); }   // wrong secret -> the database raises -> 500 -> we answer 401
  catch { return NextResponse.json({ error: "forbidden" }, { status: 401 }); }
  after(async () => {
    useToken(token);
    try {
      const job = await rpc<{ id: number; job: string; progress: Record<string, unknown>; attempts: number } | null>("job_claim", { p_lease_s: JOB_LEASE_S });
      if (!job) return;
      if (job.job === "refresh_stock") await runRefreshChunk(job);
      else if (job.job === "probe_market") await runProbeChunk(job);
    } finally { useToken(null); }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

// Shared budget guard for every paid step (AI calls). Used by the batch scripts only, never by the web app (the web app has no AI key).
// - every paid step announces itself with startStep(): prints an ESTIMATE, reads its own cap from an environment variable (default in code) and a total cap per run
//   (DRAPE_RUN_CAP_USD, default 10); the run total is shared between scripts of one run through a small ledger file when DRAPE_RUN_ID is set;
// - the guard is ENFORCED, not just documented: globalThis.fetch is wrapped, so any request to the Gemini API is refused (the process stops with exit code 3 and a
//   report) when no step is active, when the step cap is reached or when the run cap is reached; the cost of every response is added from its usageMetadata.
// In-flight requests of a concurrent batch can overshoot a cap by a few cents (concurrency x one call).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMBEDDING_IMAGE_PRICE_PER_M, PRICES } from "../config/models";

const HOST = "generativelanguage.googleapis.com";
export const RUN_CAP_USD = () => Number(process.env.DRAPE_RUN_CAP_USD ?? 10);
const ledgerFile = () => (process.env.DRAPE_RUN_ID ? join(tmpdir(), `drape-budget-${process.env.DRAPE_RUN_ID.replace(/[^\w.-]/g, "_")}.json`) : null);
let runSpent = 0;
const readRun = (): number => { const f = ledgerFile(); if (!f) return runSpent; try { return existsSync(f) ? Number(JSON.parse(readFileSync(f, "utf8")).spent) || 0 : 0; } catch { return 0; } };
const writeRun = (v: number) => { runSpent = v; const f = ledgerFile(); if (f) writeFileSync(f, JSON.stringify({ spent: v, at: new Date().toISOString() })); };

export interface StepOpts {
  name: string;
  capEnv: string;              // environment variable that holds this step's cap (USD)
  capDefault: number;          // used when the variable is not set
  cliCap?: number | null;      // --cap on the command line wins
  unitUsd: number;             // measured cost per item (for the estimate)
  items?: number | null;       // number of items when known up front; null = open-ended (the estimate is then per 1,000 items)
}
export interface Step { name: string; cap: number; spent: number; calls: number; over(): boolean; summary(): string }
const steps: Step[] = []; let active: Step | null = null, installed = false;

function stop(why: string): never {
  console.error(`\nBUDGET STOP: ${why}\n${report()}`);
  process.exit(3);
}
export const report = () => `${steps.map((s) => `  step ${s.name}: spent $${s.spent.toFixed(4)} of cap $${s.cap.toFixed(2)} (${s.calls} paid calls)`).join("\n")}\n  run total $${readRun().toFixed(4)} of cap $${RUN_CAP_USD().toFixed(2)}`;

function costOf(url: string, json: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number } }): number {
  const u = json.usageMetadata ?? {}, model = /models\/([^:/?]+)/.exec(url)?.[1] ?? "";
  if (/:(embedContent|batchEmbedContents)/.test(url)) return ((u.promptTokenCount ?? u.totalTokenCount ?? 300) * EMBEDDING_IMAGE_PRICE_PER_M) / 1e6;
  const p = PRICES[model]; if (!p) return 0.002;   // unknown model: charge a flat amount so the guard never undercounts to zero
  return ((u.promptTokenCount ?? 0) * p.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * p.out) / 1e6;
}
function install() {
  if (installed) return; installed = true;
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(HOST) || !/:(generateContent|embedContent|batchEmbedContents|streamGenerateContent)/.test(url)) return real(input, init);   // free calls (model metadata) pass
    const s = active;
    if (!s) stop("a paid Gemini call was attempted without startStep() (no budget step is active)");
    if (s.spent >= s.cap) stop(`step "${s.name}" reached its cap $${s.cap.toFixed(2)}`);
    if (readRun() >= RUN_CAP_USD()) stop(`run total reached the run cap $${RUN_CAP_USD().toFixed(2)} (DRAPE_RUN_CAP_USD)`);
    const res = await real(input, init); s.calls++;
    if (res.ok) { try { const c = costOf(url, await res.clone().json()); s.spent += c; writeRun(readRun() + c); } catch { s.spent += 0.002; writeRun(readRun() + 0.002); } }
    return res;
  }) as typeof fetch;
  process.on("exit", () => { if (steps.length) console.log(`\nSPEND REPORT\n${report()}`); });
}

export function startStep(o: StepOpts): Step {
  const cap = Number(o.cliCap ?? process.env[o.capEnv] ?? o.capDefault);
  const est = o.items != null ? `${o.items} items x $${o.unitUsd} = about $${(o.items * o.unitUsd).toFixed(2)}` : `about $${(o.unitUsd * 1000).toFixed(2)} per 1,000 items ($${o.unitUsd} each); the cap allows about ${Math.floor(cap / o.unitUsd)} items`;
  console.log(`ESTIMATE [${o.name}]: ${est}; step cap $${cap.toFixed(2)} (${o.capEnv}${o.cliCap != null ? ", --cap" : ""}); run cap $${RUN_CAP_USD().toFixed(2)} (DRAPE_RUN_CAP_USD), run spent so far $${readRun().toFixed(4)}`);
  if (o.items != null && o.items * o.unitUsd > cap) console.log(`WARNING: the estimate is above the step cap; the step will stop at the cap`);
  const s: Step = { name: o.name, cap, spent: 0, calls: 0, over: () => s.spent >= s.cap || readRun() >= RUN_CAP_USD(), summary: () => `${o.name}: $${s.spent.toFixed(4)} of cap $${cap.toFixed(2)}` };
  steps.push(s); active = s; return s;
}

install();   // importing this module is enough to guard every Gemini call of the process (a paid call without startStep() is refused)

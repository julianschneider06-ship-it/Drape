import type { Metadata } from "next";
import Link from "next/link";
import { fetchReview, type ReviewRow } from "@/lib/pipeline";

export const metadata: Metadata = { title: "Review – Drape", robots: { index: false } };
export const dynamic = "force-dynamic";

const PAGE = 24;
const STORES = ["taylorstitch", "fashionnova", "pangaia", "armedangels", "outdoorvoices", "kith", "aimeleondore", "allbirds", "representclo", "rains", "gymshark"];
const TYPES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
const SLOTS = ["top", "bottom", "shoes", "full_body", "none"];

type Params = { store?: string; type?: string; slot?: string; ready?: string; after?: string };
const pick = (v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? v : undefined);

const href = (p: Params) => {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `/review?${q}` : "/review";
};

function Card({ r }: { r: ReviewRow }) {
  const a = r.attributes;
  const styles = Object.entries(a.style_weights).filter(([, w]) => w > 0).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-200 p-2">
      <div className="h-36 w-28 shrink-0 overflow-hidden rounded bg-neutral-100">
        {r.feed_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.feed_image_url} alt={`${r.brand} ${r.name}`} loading="lazy" className="h-full w-full object-contain" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <p className="truncate font-semibold uppercase tracking-wide">{r.brand} <span className="font-normal normal-case text-neutral-400">· {r.store}</span></p>
        <p className="line-clamp-2 text-sm text-neutral-700">{r.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1">
          <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-white">{r.feed_slot}</span>
          {a.is_outer_layer && <span className="rounded bg-neutral-200 px-1.5 py-0.5">outer layer</span>}
          <span className={`rounded px-1.5 py-0.5 ${r.feed_ready ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {r.feed_ready ? "feed_ready" : `needs_image_work · ${r.image_reason}`}
          </span>
        </p>
        <p className="mt-1 text-neutral-500">
          {a.subcategory} · {a.colors.join("/")} · {a.pattern} · {a.material} · {a.fit} · {r.gender}
        </p>
        <p className="text-neutral-500">
          formal {a.formality.toFixed(1)} · bold {a.boldness.toFixed(1)} · statement {a.statement_level.toFixed(1)} · image {a.feed_suitability.toFixed(2)} ({a.view}, {a.background}{a.has_model ? ", model" : ""})
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {styles.map(([k, w]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="w-24 shrink-0 truncate text-neutral-600">{k}</span>
              <span className="h-1.5 flex-1 rounded bg-neutral-100"><span className="block h-full rounded bg-black" style={{ width: `${Math.round(w * 100)}%` }} /></span>
              <span className="w-6 text-right tabular-nums text-neutral-400">{w.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const store = pick(sp.store, STORES), type = pick(sp.type, TYPES), slot = pick(sp.slot, SLOTS), ready = pick(sp.ready, ["yes", "no"]);
  const after = Number(sp.after) > 0 ? Number(sp.after) : undefined;
  const rows = await fetchReview({ source: store, category: type, feed_slot: slot, feed_ready: ready ? ready === "yes" : undefined, after, limit: PAGE });
  const cur: Params = { store, type, slot, ready };

  const group = (name: keyof Params, label: string, values: string[]) => (
    <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1">
      <span className="shrink-0 text-xs text-neutral-400">{label}</span>
      {[undefined, ...values].map((v) => (
        <Link key={v ?? "all"} href={href({ ...cur, [name]: v })}
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${cur[name] === v ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-700"}`}>
          {v ?? "all"}
        </Link>
      ))}
    </div>
  );

  return (
    <main className="min-h-dvh bg-white px-3 pb-16 pt-4 text-black">
      <h1 className="mb-2 text-xl font-semibold tracking-tight">Classification review</h1>
      <div className="mb-4 space-y-1.5">
        {group("store", "store", STORES)}
        {group("type", "type", TYPES)}
        {group("slot", "slot", SLOTS)}
        {group("ready", "feed ready", ["yes", "no"])}
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <Card key={r.id} r={r} />)}</ul>
      {rows.length === 0 && <p className="py-10 text-center text-neutral-500">Nothing here.</p>}
      {rows.length === PAGE && (
        <div className="mt-6 text-center">
          <Link href={href({ ...cur, after: String(rows[rows.length - 1].id) })} className="rounded-full border border-black px-5 py-2 text-sm">More</Link>
        </div>
      )}
    </main>
  );
}

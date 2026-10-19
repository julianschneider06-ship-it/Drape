import type { Metadata } from "next";
import Link from "next/link";
import { fetchSample } from "@/lib/pipeline";

export const metadata: Metadata = { title: "Sample – Drape", robots: { index: false } };
export const dynamic = "force-dynamic";

const PAGE = 48;
const GENDERS = ["women", "men"];
const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];

type Params = { after?: string; gender?: string; category?: string };

const href = (p: Params) => {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `/sample?${q}` : "/sample";
};

export default async function SamplePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const gender = GENDERS.includes(sp.gender ?? "") ? sp.gender : undefined;
  const category = CATEGORIES.includes(sp.category ?? "") ? sp.category : undefined;
  const after = Number(sp.after) > 0 ? Number(sp.after) : undefined;
  const products = await fetchSample({ after, gender, category, limit: PAGE });
  const last = products[products.length - 1];

  const chip = (label: string, p: Params, active: boolean) => (
    <Link key={label} href={href(p)} className={`shrink-0 rounded-full border px-3 py-1 text-sm ${active ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-700"}`}>
      {label}
    </Link>
  );

  return (
    <main className="min-h-dvh bg-white px-3 pb-16 pt-4 text-black">
      <h1 className="mb-3 text-xl font-semibold tracking-tight">Sample products</h1>
      <nav className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1">
        {chip("All", { category }, !gender)}
        {GENDERS.map((g) => chip(g, { gender: g, category }, gender === g))}
        <span className="mx-1 w-px shrink-0 bg-neutral-200" />
        {chip("Any type", { gender }, !category)}
        {CATEGORIES.map((c) => chip(c, { gender, category: c }, category === c))}
      </nav>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 lg:grid-cols-6">
        {products.map((p) => (
          <li key={p.id}>
            <div className="aspect-[3/4] overflow-hidden rounded bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.primary_image_url} alt={`${p.brand} ${p.name}`} loading="lazy" className="h-full w-full object-cover" />
            </div>
            <p className="mt-1.5 truncate text-xs font-semibold uppercase tracking-wide">{p.brand}</p>
            <p className="line-clamp-2 text-sm text-neutral-600">{p.name}</p>
          </li>
        ))}
      </ul>
      {products.length === 0 && <p className="py-10 text-center text-neutral-500">No products.</p>}
      {products.length === PAGE && last && (
        <div className="mt-8 text-center">
          <Link href={href({ gender, category, after: String(last.id) })} className="rounded-full border border-black px-5 py-2 text-sm">
            More
          </Link>
        </div>
      )}
    </main>
  );
}

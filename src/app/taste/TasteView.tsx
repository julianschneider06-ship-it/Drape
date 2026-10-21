"use client";
import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/client/device";

type Pair = [string, number];
interface Summary {
  events: number; personalized: boolean; personalizeFrom: number; counts: Record<string, number>; updatedAt: string | null;
  styles: Record<"top" | "bottom" | "shoes", Pair[]>; attributes: { colours: Pair[]; coloursLess: Pair[]; categories: Pair[]; categoriesLess: Pair[]; silhouettes: Pair[]; formality: number; boldness: number };
  tags: Record<string, Pair[]>; connections: { topBottom: Pair[]; bottomShoes: Pair[]; formalityGap: number[] }; mix: Record<string, number>;
}
const List = ({ title, items }: { title: string; items: Pair[] }) => (
  <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
    {items.length ? items.map(([k, v]) => <p key={k} className="flex justify-between text-sm"><span>{k}</span><span className={v < 0 ? "text-red-600" : "text-neutral-500"}>{v}</span></p>) : <p className="text-sm text-neutral-400">none yet</p>}</div>
);

export default function TasteView() {
  const [gender, setGender] = useState<"women" | "men">("women");
  const [data, setData] = useState<{ source: string; summary: Summary; bytes?: number; events?: number } | null>(null);
  const [info, setInfo] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(location.search), dev = q.get("device");
    let g: "women" | "men" = q.get("gender") === "men" ? "men" : "women";
    try { if (!q.get("gender") && localStorage.getItem("drape.gender") === "men") g = "men"; } catch { /* ignore */ }
    setGender(g);
    let outboxN = 0; try { outboxN = JSON.parse(localStorage.getItem(`drape.outbox.${g}`) ?? "[]").length; } catch { /* ignore */ }
    setInfo(dev ? `device ${dev} (event log)` : `this device ${getDeviceId()} · ${outboxN} signals waiting for the next page`);
    const p = dev ? fetch(`/api/taste?device=${dev}&gender=${g}`) : fetch("/api/taste", { method: "POST", body: JSON.stringify({ taste: (() => { try { return localStorage.getItem(`drape.taste.${g}`); } catch { return null; } })() }) });
    p.then((r) => r.json()).then(setData).catch(() => setInfo("could not load"));
  }, []);
  const s = data?.summary;
  return (
    <main className="mx-auto max-w-md px-4 py-6 text-neutral-900">
      <h1 className="text-lg font-semibold">Taste ({gender})</h1>
      <p className="mb-4 text-xs text-neutral-500">{info}{data ? ` · source: ${data.source}${data.bytes ? ` · ${data.bytes} bytes` : ""}` : ""}</p>
      {s && <>
        <p className="mb-3 text-sm">{s.events} signals · {s.personalized ? "personalized" : `neutral until ${s.personalizeFrom}`} · last update {s.updatedAt ?? "-"}</p>
        <p className="mb-4 text-xs text-neutral-500">mix: {Object.entries(s.mix).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" · ")} · counts: {Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "-"}</p>
        <List title="Top styles: tops" items={s.styles.top} /><List title="Top styles: bottoms" items={s.styles.bottom} /><List title="Top styles: shoes" items={s.styles.shoes} />
        <List title="Colours" items={s.attributes.colours} /><List title="Colours (less)" items={s.attributes.coloursLess} />
        <List title="Categories" items={s.attributes.categories} /><List title="Categories (less)" items={s.attributes.categoriesLess} /><List title="Silhouettes" items={s.attributes.silhouettes} />
        <p className="mb-3 text-sm">formality {s.attributes.formality} · boldness {s.attributes.boldness}</p>
        {Object.entries(s.tags).map(([k, v]) => <List key={k} title={`Tag: ${k}`} items={v} />)}
        <List title="Connections top + bottom" items={s.connections.topBottom} /><List title="Connections bottom + shoes" items={s.connections.bottomShoes} />
        <p className="text-sm">formality gap bins: {s.connections.formalityGap.join(" / ")}</p>
      </>}
    </main>
  );
}

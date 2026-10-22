"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import { BUTTON_BAR_PX } from "@/lib/layout/config";
import { FAMILY_KEYS, type StyleFamily } from "@/config/style-families";
import { EXTRAS, FAMILY_INFO, ITEMS, SEASONS, extraIcon, familyIcon, seasonIcon, type SearchExtra, type SearchItem, type SearchSeason } from "@/config/search";
import { facetCount, isSearchedSlot, type Facets, type Relaxed } from "@/lib/search";
import { outfitIcons } from "@/lib/outfit-icons";
import { track } from "@/lib/client/track";
import OutfitCanvas from "./OutfitCanvas";
import OutfitIcons, { IconGlyph } from "./OutfitIcons";
import type { IconId } from "@/lib/outfit-icons";

interface Sel { family: StyleFamily | null; season: SearchSeason | null; extra: SearchExtra | null; item: SearchItem | null }
type Step = "A" | "B" | "C" | "D";
type Phase = "config" | "loading" | "results" | "error";
interface Result { items: FeedOutfit[]; relaxed: Relaxed }

const EMPTY: Sel = { family: null, season: null, extra: null, item: null };
const fc = (f: Facets | null, s: Sel) => (f ? facetCount(f, s) : 1);   // no counts yet (or failed): everything is offered

/** drop picks that no outfit has together with the rest (never the pick that was just made) */
function normalize(f: Facets | null, s: Sel, keep: keyof Sel): Sel {
  if (!f) return s;
  const n = { ...s };
  for (const k of ["extra", "season", "item", "family"] as (keyof Sel)[]) {
    if (fc(f, n) > 0) break;
    if (k !== keep && n[k]) (n as Record<string, unknown>)[k] = null;
  }
  return n;
}

function Option({ icon, label, hint, on, disabled, onClick }: { icon: IconId | null; label: string; hint: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${on ? "border-black bg-neutral-50" : "border-neutral-200 bg-white"} ${disabled ? "opacity-35" : "active:bg-neutral-50"}`}>
      {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100"><IconGlyph id={icon} size={20} stroke={on ? "#000" : "#6b7280"} width={1.6} /></span>}
      <span className="min-w-0"><span className="block text-sm font-medium text-black">{label}</span><span className="block text-xs leading-snug text-neutral-500">{hint}</span></span>
    </button>
  );
}

function Section({ step, title, sub, children }: { step: Step; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section data-step={step} className="px-4 pb-6">
      <h2 className="text-sm font-semibold text-black">{title}</h2><p className="mb-2 text-xs text-neutral-500">{sub}</p>{children}
    </section>
  );
}

function Search({ gender, canvas, iconsOn, onOpen, onBack }: {
  gender: "women" | "men"; canvas: { w: number; h: number } | null; iconsOn: boolean;
  onOpen: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => void; onBack: () => void;
}) {
  const [sel, setSel] = useState<Sel>(EMPTY);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [phase, setPhase] = useState<Phase>("config");
  const [res, setRes] = useState<Result | null>(null);
  const [shownItem, setShownItem] = useState<SearchItem>("shoes");   // the item of the results on screen (the selection may change while configuring)
  const [lastSel, setLastSel] = useState<Sel>(EMPTY);
  const scroller = useRef<HTMLDivElement>(null), cfg = useRef<HTMLDivElement>(null), run = useRef(0);

  useEffect(() => {   // option counts for this gender (read-only, CDN cached); a failure just offers everything
    const ac = new AbortController();
    fetch(`/api/search?gender=${gender}`, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).then((j: { facets: Facets } | null) => setFacets(j?.facets ?? null)).catch(() => undefined);
    return () => ac.abort();
  }, [gender]);

  const pick = useCallback(<K extends keyof Sel>(k: K, v: Sel[K]) => setSel((s) => normalize(facets, { ...s, [k]: s[k] === v && (k === "season" || k === "extra") ? null : v }, k)), [facets]);
  const ok = (k: keyof Sel, v: string) => fc(facets, { ...sel, [k]: v }) > 0;
  const ready = !!sel.family && !!sel.item;

  const submit = useCallback(async () => {
    if (!sel.family || !sel.item) return;
    const mine = ++run.current, s = sel;
    setLastSel(s); setShownItem(s.item!); setPhase("loading");
    const q = new URLSearchParams({ gender, family: s.family!, item: s.item! }); if (s.season) q.set("season", s.season); if (s.extra) q.set("extra", s.extra);
    try {
      const r = await fetch(`/api/search?${q}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as Result;
      if (mine !== run.current) return;
      setRes(j); setPhase("results");
      track({ event_type: "search_submitted", gender, ctx: { sq: { f: s.family!, i: s.item!, ...(s.season ? { s: s.season } : {}), ...(s.extra ? { e: s.extra } : {}), r: j.relaxed, n: j.items.length } } });
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }));
    } catch { if (mine === run.current) setPhase("error"); }
  }, [sel, gender]);

  const edit = (step: Step) => {
    setPhase("config"); setSel(lastSel);
    requestAnimationFrame(() => cfg.current?.querySelector(`[data-step="${step}"]`)?.scrollIntoView({ block: "start" }));
  };

  const dim = useCallback((slot: SlotName) => !isSearchedSlot(slot, shownItem), [shownItem]);
  const chips: { step: Step; icon: IconId | null; label: string }[] = useMemo(() => {
    const s = lastSel; if (!s.family || !s.item) return [];
    return [
      { step: "A", icon: familyIcon(s.family), label: FAMILY_INFO[s.family].label },
      ...(s.season ? [{ step: "B" as Step, icon: seasonIcon(s.season), label: SEASONS.find((x) => x.id === s.season)!.label }] : []),
      ...(s.extra ? [{ step: "C" as Step, icon: extraIcon(s.extra), label: EXTRAS.find((x) => x.id === s.extra)!.label }] : []),
      { step: "D", icon: null, label: ITEMS.find((x) => x.id === s.item)!.label },
    ];
  }, [lastSel]);

  const showResults = phase === "results" && res;
  return (
    <div className="absolute inset-0 bg-white">
      {/* configurator (stays mounted so the choices survive a visit to the results) */}
      <div ref={cfg} className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-y-contain pt-[calc(max(0.75rem,env(safe-area-inset-top))+2.75rem)]" style={{ visibility: phase === "config" || phase === "loading" || phase === "error" ? "visible" : "hidden" }}>
        <h1 className="px-4 pb-4 text-xl font-semibold tracking-tight">Find an outfit</h1>
        <Section step="A" title="1. Pick a style family" sub="Required. Search looks at the whole family.">
          <div className="grid gap-2">{FAMILY_KEYS.map((f) => <Option key={f} icon={familyIcon(f)} label={FAMILY_INFO[f].label} hint={FAMILY_INFO[f].hint} on={sel.family === f} disabled={!ok("family", f)} onClick={() => pick("family", f)} />)}</div>
        </Section>
        <Section step="B" title="2. Pick a season" sub="Optional.">
          <div className="grid grid-cols-2 gap-2">{SEASONS.map((s) => <Option key={s.id} icon={seasonIcon(s.id)} label={s.label} hint={s.hint} on={sel.season === s.id} disabled={!ok("season", s.id) && sel.season !== s.id} onClick={() => pick("season", s.id)} />)}</div>
        </Section>
        <Section step="C" title="3. Add one extra" sub="Optional. Only extras that have outfits are shown.">
          <div className="grid grid-cols-2 gap-2">{EXTRAS.filter((e) => ok("extra", e.id) || sel.extra === e.id || !facets).map((e) => <Option key={e.id} icon={extraIcon(e.id)} label={e.label} hint={e.hint} on={sel.extra === e.id} disabled={false} onClick={() => pick("extra", e.id)} />)}</div>
        </Section>
        <Section step="D" title="4. What are you looking for?" sub="Required. This piece stays in colour, the rest is greyed out.">
          <div className="grid grid-cols-2 gap-2">{ITEMS.map((i) => <Option key={i.id} icon={null} label={i.label} hint={i.hint} on={sel.item === i.id} disabled={!ok("item", i.id)} onClick={() => pick("item", i.id)} />)}</div>
        </Section>
        <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-3 pt-4">
          {phase === "error" && <p className="mb-2 text-center text-xs text-neutral-500">Search is not available right now. Please try again.</p>}
          <button type="button" disabled={!ready || phase === "loading"} onClick={submit}
            className={`w-full rounded-full py-3 text-sm font-medium text-white transition-opacity ${ready ? "bg-black active:opacity-80" : "bg-neutral-300"}`}>{phase === "loading" ? "Searching…" : "Search"}</button>
        </div>
      </div>

      {showResults && (
        <div className="absolute inset-0 bg-white">
          <div className="absolute inset-x-0 top-0 z-20 bg-white/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <div className="no-scrollbar flex h-9 items-center gap-2 overflow-x-auto" role="list" aria-label="Your search (tap to change)">
              {chips.map((c) => (
                <button key={c.step} type="button" role="listitem" onClick={() => edit(c.step)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 active:bg-neutral-200">
                  {c.icon && <IconGlyph id={c.icon} size={14} />}{c.label}
                </button>
              ))}
            </div>
          </div>
          <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain">
            {res.items.map((o, i) => (
              <section key={o.id} data-i={i} className="relative flex h-full snap-start snap-always flex-col items-center justify-center pt-[3.75rem]" style={{ paddingBottom: `calc(${BUTTON_BAR_PX}px + var(--safe-b, 0px))` }}>
                {canvas && <OutfitCanvas outfit={o} canvas={canvas} priority={i < 2} dim={dim} onOpen={(c, slot) => onOpen(c, o, i, slot)} />}
                {iconsOn && <OutfitIcons icons={outfitIcons(o.tags)} />}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-white px-4 text-xs text-neutral-400" style={{ height: `calc(${BUTTON_BAR_PX}px + var(--safe-b, 0px))`, paddingBottom: "var(--safe-b, 0px)" }}>
                  {i + 1} / {res.items.length}{res.relaxed !== "none" ? " · Showing fewer exact matches" : ""}
                </div>
              </section>
            ))}
            <section className="flex h-full snap-start flex-col items-center justify-center gap-3 px-8 text-center" data-end>
              {res.items.length ? (
                <>
                  <p className="text-base font-semibold">That&apos;s all for now.</p>
                  <p className="text-sm text-neutral-500">Refine search or go back to For You.</p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold">No outfits found for this search.</p>
                  <p className="text-sm text-neutral-500">Try another style family or item.</p>
                </>
              )}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => edit("A")} className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white">{res.items.length ? "Refine search" : "Change search"}</button>
                {res.items.length > 0 && <button type="button" onClick={onBack} className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700">For You</button>}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
export default memo(Search);

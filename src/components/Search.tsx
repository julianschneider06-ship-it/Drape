"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import { BUTTON_BAR_PX } from "@/lib/layout/config";
import { FAMILY_KEYS, type StyleFamily } from "@/config/style-families";
import { DIRECTIONS, EXTRAS, HIGHLIGHT_KEY, SEARCH_STATE_KEY, FAMILY_INFO, ITEMS, SEASONS, dirIcon, extraIcon, familyIcon, itemIcon, seasonIcon, type Direction, type SearchExtra, type SearchItem, type SearchSeason } from "@/config/search";
import { facetCount, isSearchedSlot, matchCount, type Facets, type Relaxed } from "@/lib/search";
import { STYLES_GENDER_KEY, STYLES_KEY, cleanStyles } from "@/lib/welcome";
import { track } from "@/lib/client/track";
import OutfitCanvas from "./OutfitCanvas";
import { shineVisible } from "@/lib/shine";
import { EMPTY_SEL, canClear, decodeState, encodeState, freshState, tapAction, type Phase, type Sel } from "@/lib/search-state";
import { IconGlyph } from "./OutfitIcons";
import type { IconId } from "@/lib/outfit-icons";

type Step = "G" | "A" | "B" | "C" | "D";   // G direction (men / women), A part, B style family, C season, D extra (the order of the configurator)
interface Page { items: FeedOutfit[]; sids: number[]; relaxed: Relaxed; total: number; next: number; skipped: number }
interface Result { items: FeedOutfit[]; relaxed: Relaxed; total: number; next: number; skipped: number; done: boolean; more: boolean; failed: boolean }
const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
/** the device's signals for ordering (read once per search so the order stays stable): taste from likes + the likes not yet folded into it (the feed's outbox) + the welcome style picks as the starting prior */
function signalsFor(g: string): { taste?: string; seed?: string[]; signals?: unknown[] } {
  let seed: string[] = []; try { if (ls(STYLES_GENDER_KEY) === g) seed = cleanStyles(JSON.parse(ls(STYLES_KEY) ?? "[]")); } catch { /* none */ }
  const taste = ls(`drape.taste.${g}`);
  let signals: unknown[] = []; try { const ob = JSON.parse(ls(`drape.outbox.${g}`) ?? "[]"); if (Array.isArray(ob)) signals = ob.slice(-80); } catch { /* none */ }
  return { ...(taste ? { taste } : {}), ...(seed.length ? { seed } : {}), ...(signals.length ? { signals } : {}) };
}

const EMPTY: Sel = EMPTY_SEL;
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* ignore */ } } };
const ORDER: (keyof Sel)[] = ["item", "family", "season", "extra"];
const fc = (f: Facets | null, s: Sel) => (f ? facetCount(f, s) : 1);   // no counts yet (or failed): everything is offered
/** counts of an option depend only on the steps before it (part first, then family, season, extra) */
const before = (s: Sel, k: keyof Sel, v: string): Sel => { const o = { ...EMPTY }; for (const x of ORDER) { if (x === k) { (o as Record<string, unknown>)[x] = v; break; } (o as Record<string, unknown>)[x] = s[x]; } return o; };
/** after a pick, later picks that no longer have results are dropped (earlier picks never) */
function normalize(f: Facets | null, s: Sel, k: keyof Sel, incl = false): Sel {
  if (!f) return s;
  const n = { ...s };
  for (const x of ORDER.slice(ORDER.indexOf(k) + (incl ? 0 : 1))) if (n[x] && fc(f, before(n, x, n[x] as string)) === 0) (n as Record<string, unknown>)[x] = null;
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

function Search({ gender, tapKey, canvas, onOpen, onBack }: {
  gender: "women" | "men"; tapKey: number; canvas: { w: number; h: number } | null;
  onOpen: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => void; onBack: () => void;
}) {
  const saved = useMemo(() => (typeof window === "undefined" ? null : decodeState(ss.get(SEARCH_STATE_KEY))), []);   // the selection survives a reload of the page (this session only, selection without results)
  const [dir, setDir] = useState<Direction>(saved?.dir ?? gender);   // step 1: preselected with the feed's direction, can be changed
  const [sel, setSel] = useState<Sel>(saved?.sel ?? EMPTY);
  const [fx, setFx] = useState<{ dir: Direction; f: Facets } | null>(null);
  const facets = fx && fx.dir === dir ? fx.f : null;   // counts of the chosen direction (null while they load: everything is offered)
  const [phase, setPhase] = useState<Phase>("config");
  const [res, setRes] = useState<Result | null>(null);
  const [shownItem, setShownItem] = useState<SearchItem>("shoes");   // the item of the results on screen (the selection may change while configuring)
  const [lastSel, setLastSel] = useState<Sel>(EMPTY);   // the selection of the results on screen / stored
  const [lastDir, setLastDir] = useState<Direction>(gender);
  const [highlight, setHighlight] = useState(() => ls(HIGHLIGHT_KEY) === "1");   // Highlight chip: shine strokes only while on (default off)
  const scroller = useRef<HTMLDivElement>(null), cfg = useRef<HTMLDivElement>(null), run = useRef(0), tail = useRef<HTMLElement>(null);
  const job = useRef<{ q: Record<string, unknown>; sig: object; seen: Set<number> } | null>(null);   // the running search: its query, frozen signals and the products already shown (each product once)

  useEffect(() => {   // option counts of the chosen direction (read-only, CDN cached); a failure just offers everything. Picks without results in the new direction are dropped.
    const ac = new AbortController();
    fetch(`/api/search?gender=${dir}`, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).then((j: { facets: Facets } | null) => {
      if (!j?.facets) return;
      setFx({ dir, f: j.facets }); setSel((s) => normalize(j.facets, s, "item", true));
    }).catch(() => undefined);
    return () => ac.abort();
  }, [dir]);

  useEffect(() => { ss.set(SEARCH_STATE_KEY, encodeState(dir, sel)); }, [dir, sel]);

  const phaseRef = useRef<Phase>(phase), hasRes = useRef(false);
  phaseRef.current = phase; hasRes.current = !!res;
  useEffect(() => {   // "Search" tapped again in the bottom bar: results <-> configurator (the selection is pre-filled; an unsubmitted change is dropped when going back)
    if (!tapKey) return;
    const act = tapAction(phaseRef.current, hasRes.current);
    if (act === "open-config") { setPhase("config"); requestAnimationFrame(() => cfg.current?.scrollTo({ top: 0 })); }
    else if (act === "back-to-results") { setSel(lastSel); setDir(lastDir); setPhase("results"); }
  }, [tapKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {   // fresh configurator: direction back to the feed's, nothing selected, stored results discarded
    run.current++; job.current = null;
    const f = freshState(gender);
    setDir(f.dir); setSel(f.sel); setLastSel(f.sel); setLastDir(f.dir); setRes(null); setPhase("config");
    requestAnimationFrame(() => cfg.current?.scrollTo({ top: 0 }));
  }, [gender]);

  const pick = useCallback(<K extends keyof Sel>(k: K, v: Sel[K]) => setSel((s) => normalize(facets, { ...s, [k]: s[k] === v && (k === "season" || k === "extra") ? null : v }, k)), [facets]);
  const ok = (k: keyof Sel, v: string) => fc(facets, before(sel, k, v)) > 0;
  const ready = !!sel.family && !!sel.item;
  const n = ready && facets ? matchCount(facets, { item: sel.item!, family: sel.family!, season: sel.season, extra: sel.extra }) : null;   // products this search delivers (null = counts not loaded)

  /** the next small page of the running search (outfits are composed around the next products only when needed) */
  const fetchPage = useCallback(async (from: number, mine: number): Promise<Page | null> => {
    const j = job.current; if (!j) return null;
    const r = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...j.q, from, ...j.sig }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(String(r.status));
    const p = (await r.json()) as Page;
    return mine === run.current ? p : null;
  }, []);

  /** results of another direction than the feed's: tagged so a like carries no outfit context / taste signal (the feed's taste is per direction) */
  const mark = useCallback((items: FeedOutfit[]) => { const d = job.current?.q.gender; return d === gender || !d ? items : items.map((o) => ({ ...o, og: d as Direction })); }, [gender]);

  const submit = useCallback(async () => {
    if (!sel.family || !sel.item || n === 0) return;
    const mine = ++run.current, s = sel, prevJob = job.current;
    setPhase("loading");
    job.current = { q: { gender: dir, family: s.family, item: s.item, ...(s.season ? { season: s.season } : {}), ...(s.extra ? { extra: s.extra } : {}) }, sig: signalsFor(dir), seen: new Set() };
    try {
      const p = await fetchPage(0, mine); if (!p) return;
      const items = mark(p.items.filter((_, i) => { const id = p.sids[i]; if (job.current!.seen.has(id)) return false; job.current!.seen.add(id); return true; }));
      setLastSel(s); setLastDir(dir); setShownItem(s.item!);
      setRes({ items, relaxed: p.relaxed, total: p.total, next: p.next, skipped: p.skipped, done: p.next >= p.total, more: false, failed: false }); setPhase("results");
      track({ event_type: "search_submitted", gender: dir, ctx: { sq: { d: dir, f: s.family!, i: s.item!, ...(s.season ? { s: s.season } : {}), ...(s.extra ? { e: s.extra } : {}), r: p.relaxed, n: p.total } } });
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }));
    } catch { if (mine === run.current) { job.current = prevJob; setPhase("error"); } }   // a failed search leaves the previous results (and their paging) as they were
  }, [sel, dir, n, fetchPage, mark]);

  const more = useCallback(async () => {
    const mine = run.current, cur = res; if (!cur || cur.done || cur.more || !job.current) return;
    setRes({ ...cur, more: true, failed: false });
    try {
      const p = await fetchPage(cur.next, mine); if (!p) return;
      const items = mark(p.items.filter((_, i) => { const id = p.sids[i]; if (job.current!.seen.has(id)) return false; job.current!.seen.add(id); return true; }));
      setRes((r) => (r && mine === run.current ? { ...r, items: [...r.items, ...items], next: p.next, skipped: r.skipped + p.skipped, done: p.next >= r.total, more: false } : r));
    } catch { setRes((r) => (r && mine === run.current ? { ...r, more: false, failed: true } : r)); }
  }, [res, fetchPage, mark]);

  useEffect(() => {   // load the next page when the end of the list comes within about one screen (no polling: an observer on the last section)
    const el = tail.current, root = scroller.current;
    if (!el || !root || !res || phase !== "results" || res.done || res.more || res.failed) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) more(); }, { root, rootMargin: "100% 0px" });
    io.observe(el); return () => io.disconnect();
  }, [res, more, phase]);

  const edit = (step: Step) => {
    setPhase("config"); setSel(lastSel); setDir(lastDir);
    requestAnimationFrame(() => cfg.current?.querySelector(`[data-step="${step}"]`)?.scrollIntoView({ block: "start" }));
  };

  const forcedOff = useMemo(() => typeof window !== "undefined" && !shineVisible(window.location.search, true), []);   // ?shine=0 forces the strokes off
  const shineOn = highlight && !forcedOff;
  const toggleHighlight = useCallback(() => setHighlight((h) => { try { localStorage.setItem(HIGHLIGHT_KEY, h ? "0" : "1"); } catch { /* ignore */ } return !h; }), []);
  const dim = useCallback((slot: SlotName) => !isSearchedSlot(slot, shownItem), [shownItem]);
  const chips: { step: Step; icon: IconId | null; label: string }[] = useMemo(() => {
    const s = lastSel; if (!s.family || !s.item) return [];
    return [
      { step: "G", icon: dirIcon(lastDir), label: DIRECTIONS.find((x) => x.id === lastDir)!.label },
      { step: "A", icon: null, label: ITEMS.find((x) => x.id === s.item)!.label },
      { step: "B", icon: familyIcon(s.family), label: FAMILY_INFO[s.family].label },
      ...(s.season ? [{ step: "C" as Step, icon: seasonIcon(s.season), label: SEASONS.find((x) => x.id === s.season)!.label }] : []),
      ...(s.extra ? [{ step: "D" as Step, icon: extraIcon(s.extra), label: EXTRAS.find((x) => x.id === s.extra)!.label }] : []),
    ];
  }, [lastSel, lastDir]);

  const showing = phase === "results";   // results stay mounted (hidden) while the configurator is open, so the scroll position is kept
  const clearable = canClear(dir, gender, sel, !!res);
  return (
    <div className="absolute inset-0 bg-white">
      {/* configurator (stays mounted so the choices survive a visit to the results) */}
      <div ref={cfg} className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-y-contain pt-[calc(max(0.75rem,env(safe-area-inset-top))+2.75rem)]" style={{ visibility: showing ? "hidden" : "inherit" }}>
        <h1 className="px-4 pb-4 text-xl font-semibold tracking-tight">Find an outfit</h1>
        <Section step="G" title="1. Men or women?" sub="Required. Search shows only this direction.">
          <div className="grid grid-cols-2 gap-2">{DIRECTIONS.map((d) => <Option key={d.id} icon={dirIcon(d.id)} label={d.label} hint={d.hint} on={dir === d.id} disabled={false} onClick={() => setDir(d.id)} />)}</div>
        </Section>
        <Section step="A" title="2. What are you looking for?" sub="Required. This piece stays in colour, the rest is greyed out.">
          <div className="grid grid-cols-2 gap-2">{ITEMS.map((i) => <Option key={i.id} icon={itemIcon(i.id)} label={i.label} hint={i.hint} on={sel.item === i.id} disabled={!ok("item", i.id)} onClick={() => pick("item", i.id)} />)}</div>
        </Section>
        <Section step="B" title="3. Pick a style family" sub="Required. The piece matches this family; the rest of the outfit can be any style.">
          <div className="grid gap-2">{FAMILY_KEYS.map((f) => <Option key={f} icon={familyIcon(f)} label={FAMILY_INFO[f].label} hint={FAMILY_INFO[f].hint} on={sel.family === f} disabled={!ok("family", f)} onClick={() => pick("family", f)} />)}</div>
        </Section>
        <Section step="C" title="4. Pick a season" sub="Optional.">
          <div className="grid grid-cols-2 gap-2">{SEASONS.map((s) => <Option key={s.id} icon={seasonIcon(s.id)} label={s.label} hint={s.hint} on={sel.season === s.id} disabled={!ok("season", s.id) && sel.season !== s.id} onClick={() => pick("season", s.id)} />)}</div>
        </Section>
        <Section step="D" title="5. Add one extra" sub="Optional. Only extras that have results are shown.">
          <div className="grid grid-cols-2 gap-2">{EXTRAS.filter((e) => ok("extra", e.id) || sel.extra === e.id || !facets).map((e) => <Option key={e.id} icon={extraIcon(e.id)} label={e.label} hint={e.hint} on={sel.extra === e.id} disabled={false} onClick={() => pick("extra", e.id)} />)}</div>
        </Section>
        <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-3 pt-4">
          {phase === "error" && <p className="mb-2 text-center text-xs text-neutral-500">Search is not available right now. Please try again.</p>}
          <button type="button" disabled={!clearable || phase === "loading"} onClick={clear}
            className="mb-2 w-full rounded-full border border-neutral-300 bg-white py-2 text-sm text-neutral-600 transition-opacity active:bg-neutral-50 disabled:opacity-40">Clear</button>
          <button type="button" disabled={!ready || phase === "loading" || n === 0} onClick={submit}
            className={`w-full rounded-full py-3 text-sm font-medium text-white transition-opacity ${ready && n !== 0 ? "bg-black active:opacity-80" : "bg-neutral-300"}`}>{phase === "loading" ? "Searching…" : n === null ? "Search" : `Search (${n})`}</button>
        </div>
      </div>

      {res && (
        <div className="absolute inset-0 bg-white" style={{ visibility: showing ? "inherit" : "hidden" }}>
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
                {canvas && <OutfitCanvas outfit={o} canvas={canvas} priority={i < 2} dim={dim} shine={shineOn ? { color: o.sc ?? null } : undefined} onOpen={(c, slot) => onOpen(c, o, i, slot)} />}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-white px-24 text-center text-xs leading-tight text-neutral-400" style={{ height: `calc(${BUTTON_BAR_PX}px + var(--safe-b, 0px))`, paddingBottom: "var(--safe-b, 0px)" }}>
                  {i + 1} / {res.done ? res.items.length : res.total - res.skipped}{res.relaxed !== "none" ? " · Showing fewer exact matches" : ""}
                </div>
              </section>
            ))}
            {!res.done && (
              <section ref={tail} className="flex h-full snap-start flex-col items-center justify-center gap-3 px-8 text-center" data-more>
                <p className="text-sm text-neutral-400">{res.failed ? "Could not load more." : "Loading…"}</p>
                {res.failed && <button type="button" onClick={() => setRes({ ...res, failed: false })} className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700">Try again</button>}
              </section>
            )}
            {res.done && <section className="flex h-full snap-start flex-col items-center justify-center gap-3 px-8 text-center" data-end>
              {res.items.length ? (
                <>
                  <p className="text-base font-semibold">That&apos;s all for now.</p>
                  <p className="text-sm text-neutral-500">Refine search or go back to For You.</p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold">No outfits found for this search.</p>
                  <p className="text-sm text-neutral-500">Try another style family or part.</p>
                </>
              )}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => edit("B")} className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white">{res.items.length ? "Refine search" : "Change search"}</button>
                {res.items.length > 0 && <button type="button" onClick={onBack} className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700">For You</button>}
              </div>
            </section>}
          </div>
          {!forcedOff && (   // Highlight chip: bottom left inside the white strip under the card (above the bottom bar), centred in its height; the counter text keeps clear of it (side padding)
            <button type="button" aria-pressed={highlight} onClick={toggleHighlight} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              className={`absolute left-4 z-20 flex items-center rounded-2xl border px-3 py-2 text-sm font-medium transition-colors [touch-action:manipulation] ${highlight ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-black active:bg-neutral-50"}`}
              style={{ bottom: `calc(${(BUTTON_BAR_PX - 36) / 2}px + var(--safe-b, 0px))` }}>Highlight</button>
          )}
        </div>
      )}
    </div>
  );
}
export default memo(Search);

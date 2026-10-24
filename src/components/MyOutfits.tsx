"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { MENU } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { fadeSlide, pressProps } from "@/lib/menu-motion";
import { MY_OUTFITS_ACC, MY_OUTFITS_MAX_SAVED, MY_OUTFITS_SLOTS, MY_OUTFITS_TEXT as T } from "@/config/my-outfits";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import { canvasSize } from "@/lib/layout/engine";
import { HEADER_PX, MAX_CANVAS_W } from "@/lib/layout/config";
import { editorLayout, slotRefOf, unplacedAcc } from "@/lib/my-outfits-layout";
import { getDeviceId } from "@/lib/client/device";
import { feedSrc, viewCard } from "@/lib/client/format";
import { isGrey } from "@/lib/wishlist-outfits";
import {
  bottomLocked, deleteOutfit, emptyDraft, fromSaved, idAt, isGreyId, isOnePiece, missingRequired, newOutfitId, pickerItems, saveOutfit, setSlot, storeFull, toSaved,
  type Draft, type SavedOutfit, type SlotRef, type Store,
} from "@/lib/my-outfits";
import { loadStore, writeStore } from "@/lib/client/my-outfits-store";
import OutfitCanvas from "./OutfitCanvas";
import FeedImage from "./FeedImage";

const ACTIONS_PX = 44;   // edit / delete row under each outfit
const sig = (o: SavedOutfit) => JSON.stringify([o.top, o.bottom, o.shoes, o.acc]);
const btn = "rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700";

function Thumb({ card, grey, fill = 0.9 }: { card: FeedCard; grey: boolean; fill?: number }) {
  const v = viewCard(card, "auto");
  return <div className="absolute inset-0" style={grey ? { opacity: 0.4, filter: "saturate(0.35)" } : undefined}><FeedImage card={v} src={v.cut ? feedSrc(v, "top") : undefined} blend={!v.cut} noSale fill={fill} minW={360} /></div>;
}

/** Wishlist > My Outfits: outfits built by hand from liked products, saved on this device only (ids + slot order). Nothing is recorded. */
export default function MyOutfits({ gender, liked, onOpenProduct }: { gender: "women" | "men"; liked: ReadonlySet<number>; onOpenProduct: (card: FeedCard) => void }) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [store, setStore] = useState<Store>(() => loadStore());
  const [canvas, setCanvas] = useState<{ w: number; h: number } | null>(null);
  const [rendered, setRendered] = useState<Record<string, FeedOutfit | null>>({});   // by outfit signature
  const [likedCards, setLikedCards] = useState<FeedCard[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const asked = useRef(new Set<string>());

  const fetchLiked = useCallback(() => {
    fetch(`/api/likes?device=${getDeviceId()}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: { items: { product: FeedCard }[] }) => setLikedCards(j.items.map((i) => i.product))).catch(() => setLikedCards((p) => p ?? []));
  }, []);
  useEffect(() => { fetchLiked(); }, [fetchLiked]);

  useEffect(() => {   // draw saved outfits (read-only render request; only the ones not drawn yet)
    const todo = store.outfits.filter((o) => !asked.current.has(sig(o)));
    if (!todo.length) return;
    todo.forEach((o) => asked.current.add(sig(o)));
    fetch("/api/wishlist-outfits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender, render: todo.map(({ top, bottom, shoes, acc }) => ({ top, bottom, shoes, acc })) }), signal: AbortSignal.timeout(20000) })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: { items: (FeedOutfit | null)[] }) => setRendered((cur) => { const n = { ...cur }; todo.forEach((o, i) => { n[sig(o)] = j.items[i] ?? null; }); return n; }))
      .catch(() => todo.forEach((o) => asked.current.delete(sig(o))));
  }, [store, gender]);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const measure = () => setCanvas((p) => { const n = canvasSize(el.clientWidth, el.clientHeight + HEADER_PX - 8 - ACTIONS_PX, 0, { barPx: 0 }); return p && p.w === n.w && p.h === n.h ? p : n; });
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, []);

  const commit = (s: Store) => { setStore(s); writeStore(s); };
  const likedNow = useMemo(() => (likedCards ?? []).filter((c) => liked.has(c.id)), [likedCards, liked]);
  // cards for the editor tiles: liked products + the products of the outfit being edited (an unliked one still shows, grey)
  const cardById = useMemo(() => {
    const map = new Map<number, FeedCard>();
    for (const o of Object.values(rendered)) if (o) for (const c of [o.top, o.bottom, o.shoes, ...(o.accessories ?? []).map((a) => a.card)]) if (c && c.id > 0) map.set(c.id, c);
    for (const c of likedCards ?? []) map.set(c.id, c);
    return map;
  }, [rendered, likedCards]);

  const openEditor = (o?: SavedOutfit) => { fetchLiked(); setEditing(o ? { id: o.id, draft: fromSaved(o) } : { id: newOutfitId(), draft: emptyDraft() }); };
  const full = storeFull(store);

  return (
    <>
    {editing && <Editor key={editing.id} initial={editing.draft} cardById={cardById} liked={liked} likedCards={likedNow} reduced={reduced}
      onCancel={() => setEditing(null)}
      onSave={(d) => { const next = saveOutfit(store, toSaved(d, editing.id)); if (next) commit(next); setEditing(null); }} />}
    <div ref={root} className="absolute inset-0 overflow-y-auto overscroll-y-contain bg-white px-3 pb-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <div className="sticky top-0 z-10 flex w-full flex-col items-center gap-1 bg-white py-2">
          <m.button type="button" onClick={() => openEditor()} disabled={full || liked.size === 0} {...pressProps(reduced, MENU.pressScale)}
            className={`${btn} ${full || liked.size === 0 ? "opacity-40" : ""}`}>{T.newOutfit}</m.button>
          {full && <p className="text-xs text-neutral-500">{T.full(MY_OUTFITS_MAX_SAVED)}</p>}
        </div>
        {liked.size === 0 && <m.p {...fadeSlide(reduced, MENU.hintShiftPx)} className="px-8 py-16 text-center text-sm text-neutral-500">{T.noLikes}</m.p>}
        {liked.size > 0 && store.outfits.length === 0 && <m.p {...fadeSlide(reduced, MENU.hintShiftPx)} className="px-8 py-12 text-center text-sm text-neutral-500">{T.empty}</m.p>}
        {canvas && store.outfits.map((s) => {
          const o = rendered[sig(s)];
          return (
            <section key={s.id} className="flex w-full flex-col items-center py-2" data-outfit={s.id}>
              {o ? (
                <div className="relative" style={{ width: canvas.w, height: canvas.h }}>
                  <OutfitCanvas outfit={o} canvas={canvas} priority={false} dim={(slot: SlotName) => isGrey(o, slot, liked)} likeDim onOpen={(c) => onOpenProduct(c)} />
                </div>
              ) : (
                <div className="flex items-center justify-center text-sm text-neutral-400" style={{ width: canvas.w, height: canvas.h }}>{sig(s) in rendered ? "These products are no longer available." : "Loading…"}</div>
              )}
              <div className="mt-1 flex items-center gap-2" style={{ height: ACTIONS_PX - 4 }}>
                {confirm === s.id ? (<>
                  <span className="text-sm text-neutral-600">{T.confirmDelete}</span>
                  <button type="button" className={btn} onClick={() => setConfirm(null)}>Cancel</button>
                  <button type="button" className="rounded-full bg-black px-4 py-2 text-sm text-white" onClick={() => { commit(deleteOutfit(store, s.id)); setConfirm(null); }}>Delete</button>
                </>) : (<>
                  <button type="button" className={btn} onClick={() => openEditor(s)}>Edit</button>
                  <button type="button" className={btn} onClick={() => setConfirm(s.id)}>Delete</button>
                </>)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
    </>
  );
}

function Editor({ initial, cardById, liked, likedCards, reduced, onCancel, onSave }: {
  initial: Draft; cardById: Map<number, FeedCard>; liked: ReadonlySet<number>; likedCards: FeedCard[]; reduced: boolean; onCancel: () => void; onSave: (d: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [picking, setPicking] = useState<SlotRef | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = area.current; if (!el) return;
    const measure = () => setCanvas((p) => { const n = { w: Math.min(el.clientWidth, MAX_CANVAS_W), h: Math.max(240, el.clientHeight) }; return p && p.w === n.w && p.h === n.h ? p : n; });
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, []);
  const cardOf = (id: number | null) => (id !== null ? cardById.get(id) : undefined);
  const topCard = cardOf(draft.top), locked = bottomLocked(topCard);
  const missing = missingRequired(draft, isOnePiece(topCard)), ok = missing.length === 0;
  const layout = useMemo(() => {
    if (!canvas) return null;
    const v = (c: FeedCard | undefined) => (c ? viewCard(c, "auto") : undefined);
    return editorLayout({ top: v(topCard), bottom: v(cardOf(draft.bottom)), shoes: v(cardOf(draft.shoes)) }, canvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, draft.top, draft.bottom, draft.shoes, topCard, cardById]);
  const labelOf = (ref: SlotRef) => (typeof ref === "string" ? MY_OUTFITS_SLOTS.find((s) => s.id === ref)!.label : MY_OUTFITS_ACC.label);
  const tile = (ref: SlotRef, rect: { x: number; y: number; w: number; h: number } | null, z = 1, rot = 0) => {
    const id = idAt(draft, ref), c = cardOf(id);
    const label = labelOf(ref), main = typeof ref === "string";
    const style: React.CSSProperties = rect && canvas
      ? { left: `${(rect.x / canvas.w) * 100}%`, top: `${(rect.y / canvas.h) * 100}%`, width: `${(rect.w / canvas.w) * 100}%`, height: `${(rect.h / canvas.h) * 100}%`, zIndex: z, transform: rot ? `rotate(${rot}deg)` : undefined }
      : {};
    const grey = c ? isGreyId(c.id, liked) : false;
    return (
      <button key={main ? ref : `acc${ref.acc}`} type="button" onClick={() => setPicking(ref)} aria-label={`${label}${c ? `: ${c.brand} ${c.name}` : " (empty)"}`} data-slot={main ? ref : `acc${ref.acc + 1}`}
        className={rect ? "absolute select-none" : "relative block h-12 w-12 shrink-0"} style={{ ...style, touchAction: "manipulation" }}>
        {c ? <Thumb card={c} grey={grey} fill={1} /> : (
          <span className="absolute inset-0 flex items-center justify-center rounded-md border border-neutral-300 text-[11px] text-neutral-400" style={{ borderWidth: 1 }}>{main ? label : "+"}</span>
        )}
      </button>
    );
  };
  const placedSlots = layout?.pieces ?? [];
  const extra = layout ? unplacedAcc(layout, draft.acc.length).filter((i) => draft.acc[i] !== null) : [];
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <button type="button" onClick={onCancel} aria-label="Back without saving" className="flex h-10 w-10 items-center justify-center text-neutral-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="text-sm font-medium">Outfit</span>
        <button type="button" onClick={() => ok && onSave(draft)} disabled={!ok} aria-label="Save outfit" className={`flex h-10 w-10 items-center justify-center ${ok ? "text-black" : "text-neutral-300"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
      </div>
      <p className="h-4 shrink-0 px-3 text-center text-xs text-neutral-500" data-missing={ok ? "" : missing.join(",")}>{ok ? "" : T.missing(missing)}</p>
      <div ref={area} className="relative min-h-0 flex-1">
        {canvas && layout && (
          <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: canvas.w, height: canvas.h }} data-editor-layout={layout.template}>
            {placedSlots.map((p) => (p.slot === "bottom" && locked ? null : tile(slotRefOf(p.slot), p.rect, p.z, p.rot)))}
          </div>
        )}
      </div>
      {extra.length > 0 && (
        <div className="shrink-0 px-3 pt-1" data-acc-extra>
          <p className="text-center text-[11px] text-neutral-400">{T.moreAcc}</p>
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">{extra.map((i) => tile({ acc: i }, null))}</div>
        </div>
      )}
      <div className="h-3 shrink-0" />
      <AnimatePresence>
        {picking && <Picker key="picker" slot={picking} draft={draft} liked={likedCards} reduced={reduced}
          onClose={() => setPicking(null)} onClear={() => { setDraft(setSlot(draft, picking, null)); setPicking(null); }}
          onPick={(c) => { setDraft(setSlot(draft, picking, c)); setPicking(null); }} />}
      </AnimatePresence>
    </div>
  );
}

function Picker({ slot, draft, liked, reduced, onClose, onClear, onPick }: { slot: SlotRef; draft: Draft; liked: FeedCard[]; reduced: boolean; onClose: () => void; onClear: () => void; onPick: (c: FeedCard) => void }) {
  const items = pickerItems(liked, draft, slot), own = idAt(draft, slot);
  const title = typeof slot === "string" ? MY_OUTFITS_SLOTS.find((s) => s.id === slot)!.label : MY_OUTFITS_ACC.label;
  return (
    <m.div {...fadeSlide(reduced, MENU.hintShiftPx)} className="absolute inset-0 z-30 flex flex-col bg-white" role="dialog" aria-label={`Choose ${title}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={onClose} className={btn}>{T.close}</button>
        <span className="text-sm font-medium">{title}</span>
        <button type="button" onClick={onClear} disabled={own === null} className={`${btn} ${own === null ? "opacity-40" : ""}`}>{T.clear}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8">
        {items.length === 0 && <p className="px-8 py-16 text-center text-sm text-neutral-500">{T.pickerEmpty}</p>}
        <ul className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} aria-label={`${c.brand} ${c.name}`} aria-pressed={c.id === own}
                className={`relative block aspect-[3/4] w-full overflow-hidden rounded-md border ${c.id === own ? "border-black" : "border-neutral-200"}`}><Thumb card={c} grey={false} /></button>
            </li>
          ))}
        </ul>
      </div>
    </m.div>
  );
}

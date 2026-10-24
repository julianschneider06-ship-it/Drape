"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { MENU } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { fadeSlide, pressProps } from "@/lib/menu-motion";
import { MY_OUTFITS_ACC, MY_OUTFITS_MAX_ACCESSORY_SLOTS, MY_OUTFITS_MAX_SAVED, MY_OUTFITS_SLOTS, MY_OUTFITS_TEXT as T } from "@/config/my-outfits";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import { canvasSize } from "@/lib/layout/engine";
import { HEADER_PX } from "@/lib/layout/config";
import { getDeviceId } from "@/lib/client/device";
import { feedSrc, viewCard } from "@/lib/client/format";
import { isGrey } from "@/lib/wishlist-outfits";
import {
  addAccSlot, bottomLocked, canAddAcc, canRemoveAcc, canSave, deleteOutfit, emptyDraft, fromSaved, idAt, isGreyId, newOutfitId, pickerItems, removeAccSlot, saveOutfit, setSlot, storeFull, toSaved,
  type Draft, type SavedOutfit, type SlotRef, type Store,
} from "@/lib/my-outfits";
import { loadStore, writeStore } from "@/lib/client/my-outfits-store";
import OutfitCanvas from "./OutfitCanvas";
import FeedImage from "./FeedImage";

const ACTIONS_PX = 44;   // edit / delete row under each outfit
const sig = (o: SavedOutfit) => JSON.stringify([o.top, o.bottom, o.shoes, o.acc]);
const btn = "rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700";

function Thumb({ card, grey }: { card: FeedCard; grey: boolean }) {
  const v = viewCard(card, "auto");
  return <div className="absolute inset-0" style={grey ? { opacity: 0.4, filter: "saturate(0.35)" } : undefined}><FeedImage card={v} src={v.cut ? feedSrc(v, "top") : undefined} blend={!v.cut} noSale fill={0.9} minW={360} /></div>;
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
  const topCard = draft.top !== null ? cardById.get(draft.top) : undefined;
  const locked = bottomLocked(topCard);
  const tile = (ref: SlotRef, label: string, wide: boolean) => {
    const id = idAt(draft, ref), c = id !== null ? cardById.get(id) : undefined;
    const isLocked = ref === "bottom" && locked;
    return (
      <div key={typeof ref === "string" ? ref : `acc${ref.acc}`} className={`relative ${wide ? "col-span-2" : ""}`}>
        <button type="button" disabled={isLocked} onClick={() => setPicking(ref)} aria-label={`${label}${c ? `: ${c.brand} ${c.name}` : " (empty)"}`}
          className={`relative block w-full overflow-hidden rounded-md border ${wide ? "aspect-[2/1]" : "aspect-[4/3]"} ${isLocked ? "border-neutral-200 bg-neutral-50" : "border-neutral-300 bg-white"}`}>
          {c ? <Thumb card={c} grey={isGreyId(c.id, liked)} /> : <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">{isLocked ? T.onepiece : `${label} +`}</span>}
          {c && <span className="absolute left-2 top-1.5 text-[11px] uppercase tracking-wide text-neutral-400">{label}</span>}
        </button>
        {typeof ref !== "string" && canRemoveAcc(draft, ref.acc) && (
          <button type="button" aria-label={T.removeAcc} onClick={() => setDraft(removeAccSlot(draft, ref.acc))} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-neutral-500">×</button>
        )}
      </div>
    );
  };
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <button type="button" onClick={onCancel} aria-label="Back without saving" className="flex h-10 w-10 items-center justify-center text-neutral-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="text-sm font-medium">Outfit</span>
        <button type="button" onClick={() => canSave(draft) && onSave(draft)} disabled={!canSave(draft)} aria-label="Save outfit" className={`flex h-10 w-10 items-center justify-center ${canSave(draft) ? "text-black" : "text-neutral-300"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          {MY_OUTFITS_SLOTS.map((s) => tile(s.id, s.label, true))}
          {draft.acc.map((_, i) => tile({ acc: i }, MY_OUTFITS_ACC.label, false))}
        </div>
        {canAddAcc(draft) && (
          <div className="mt-3 flex justify-center"><button type="button" className={btn} onClick={() => setDraft(addAccSlot(draft))}>{T.addAcc}</button></div>
        )}
        {!canAddAcc(draft) && <p className="mt-3 text-center text-xs text-neutral-400">Up to {MY_OUTFITS_MAX_ACCESSORY_SLOTS} accessories</p>}
      </div>
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

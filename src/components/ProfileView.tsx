"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as m from "motion/react-m";
import { useIsPresent } from "motion/react";
import { MENU, DURATION_MS, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { PROFILE_TEXT as T, SHOP_LEVELS } from "@/config/profile";
import { SHOP_LIST_MAX } from "@/config/shop-pref";
import { filterShops, yourShops, type ShopRowInfo } from "@/lib/profile-shops";
import { setBgLocal, setMiniLocal, setSaleLocal, setSeasonLocal, setShopLevel, usePrefs } from "@/lib/client/profile-store";
import { saleGlobalOn } from "@/lib/client/sale";
import type { ShopLevel } from "@/lib/shop-pref";
import Segmented from "./Segmented";
import Switch from "./Switch";
import DeviceDebug from "./DeviceDebug";

// The live shop list is the same for everyone; keep it for the visit so reopening the tab is instant.
let shopsCache: ShopRowInfo[] | null = null;

function useShops() {
  const [shops, setShops] = useState<ShopRowInfo[] | null>(shopsCache);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    fetch("/api/shops", { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { shops: ShopRowInfo[] }) => { shopsCache = Array.isArray(j.shops) ? j.shops : []; setShops(shopsCache); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { if (!shopsCache) load(); }, [load]);
  return { shops, failed, retry: load };
}

const Person = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6" />
  </svg>
);

/** a settings list row: label left, control right. More feed settings are added by adding rows here. */
function SettingRow({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-neutral-100 py-3">
      <div className="min-w-0"><div className="text-sm">{label}</div>{note && <div className="text-xs text-neutral-400">{note}</div>}</div>
      {children}
    </li>
  );
}

function ShopRow({ shop, level, group }: { shop: ShopRowInfo; level: ShopLevel; group: string }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2.5">
      <span className="min-w-0 truncate text-sm">{shop.name}</span>
      <Segmented compact id={`${group}-${shop.id}`} label={`${shop.name} preference`} options={SHOP_LEVELS} value={level} onChange={(v) => setShopLevel(shop.id, v)} />
    </li>
  );
}

/** Profile tab (device only): greyed account header, feed settings, per-shop preferences. Everything is stored on this device; without storage it still works for the visit. */
export default function ProfileView() {
  const reduced = useReducedMotion(), present = useIsPresent();
  const prefs = usePrefs();
  const { shops, failed, retry } = useShops();
  const [query, setQuery] = useState("");
  const globalOn = saleGlobalOn();
  const matches = useMemo(() => (shops ? filterShops(shops, query, SHOP_LIST_MAX) : []), [shops, query]);
  const mine = useMemo(() => yourShops(prefs.shops, shops), [prefs.shops, shops]);
  const searching = query.trim().length > 0;
  const levelOf = (id: string): ShopLevel => prefs.shops[id] ?? "normal";
  return (
    <m.div className={`fixed inset-x-0 top-0 z-30 flex flex-col bg-white ${present ? "" : "pointer-events-none"}`} style={{ bottom: "var(--nav-h)" }}
      initial={{ opacity: 0, y: reduced ? 0 : MENU.tabShiftPx }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 0 }}
      transition={{ duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.tabIn), ease: "easeOut" }}>
      <div className="shrink-0 bg-white px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-center py-3"><h1 className="text-base font-semibold">{T.title}</h1></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <div className="mx-auto max-w-md">
          {/* account: placeholder only, not tappable, no login */}
          <div aria-disabled="true" className="pointer-events-none flex select-none items-center gap-3 py-3 text-neutral-300">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50"><Person size={26} /></span>
            <div className="min-w-0"><div className="text-sm">{T.accountEmail}</div><div className="text-xs">{T.accountHint}</div></div>
          </div>

          <h2 className="mt-5 text-xs font-medium uppercase tracking-wide text-neutral-400">{T.feedHeading}</h2>
          <ul>
            <SettingRow label={T.saleLabel} note={globalOn ? undefined : T.saleGlobalOff}>
              <Switch label={T.saleLabel} on={prefs.sale} disabled={!globalOn} onChange={setSaleLocal} />
            </SettingRow>
            <SettingRow label={T.bgLabel}>
              <Switch label={T.bgLabel} on={prefs.bg} onChange={setBgLocal} />
            </SettingRow>
            <SettingRow label={T.seasonLabel}>
              <Switch label={T.seasonLabel} on={prefs.season} onChange={setSeasonLocal} />
            </SettingRow>
            <SettingRow label={T.miniLabel}>
              <Switch label={T.miniLabel} on={prefs.mini} onChange={setMiniLocal} />
            </SettingRow>
          </ul>

          <h2 className="mt-6 text-xs font-medium uppercase tracking-wide text-neutral-400">{T.shopsHeading}</h2>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={T.searchPlaceholder} aria-label={T.searchPlaceholder} autoComplete="off" autoCorrect="off" spellCheck={false}
            className="mt-2 w-full rounded-full bg-neutral-100 px-4 py-2 text-base outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-black" />
          {searching && (
            <section aria-label={T.results}>
              {failed && !shops ? <p className="py-4 text-sm text-neutral-400">{T.failed} <button type="button" onClick={retry} className="underline">{T.retry}</button></p>
                : !shops ? <p className="py-4 text-sm text-neutral-400">{T.loading}</p>
                : matches.length ? <ul>{matches.map((s) => <ShopRow key={s.id} shop={s} level={levelOf(s.id)} group="res" />)}</ul>
                : <p className="py-4 text-sm text-neutral-400">{T.noMatch}</p>}
            </section>
          )}
          <h3 className="mt-5 text-sm font-semibold">{T.yourShops}</h3>
          {!mine.more.length && !mine.less.length ? (
            <p className="py-3 text-sm text-neutral-400">{T.emptyYours}</p>
          ) : (
            <>
              {mine.more.length > 0 && <><div className="mt-2 text-xs text-neutral-400">{T.more}</div><ul>{mine.more.map((s) => <ShopRow key={s.id} shop={s} level="more" group="more" />)}</ul></>}
              {mine.less.length > 0 && <><div className="mt-2 text-xs text-neutral-400">{T.less}</div><ul>{mine.less.map((s) => <ShopRow key={s.id} shop={s} level="less" group="less" />)}</ul></>}
            </>
          )}
          {!searching && <p className="py-3 text-xs text-neutral-400">{T.hint}</p>}
          <DeviceDebug />
        </div>
      </div>
    </m.div>
  );
}

// Batched, append-only event tracking: events are queued and sent every few seconds, on tab hide, or at 20 events.
import { getDeviceId } from "./device";

export interface TrackEvent {
  event_type: "impression" | "dwell_ms" | "tap_product" | "view_product_click" | "scroll_past" | "outfit_up" | "outfit_down" | "outfit_clear" | "swap" | "search_started" | "search_submitted";
  product_id?: number; product_ids?: number[]; outfit_id?: number; slot?: "top" | "bottom" | "shoes" | "full" | "sheet" | "accessory";
  feed_index?: number; gender?: "women" | "men"; dwell_ms?: number;
  ctx?: { layout?: string; mode?: string; prev?: "up" | "down"; canvas?: [number, number]; v?: string; out?: number; dir?: "next" | "prev"; rank?: number; alt?: number; from?: number; tags?: Record<string, string | number | null>; sq?: { f?: string; i?: string; s?: string; e?: string; r?: string; n?: number } }; // layout context of outfit-level events
}

let queue: (TrackEvent & { client_ts: string })[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function send(useBeacon: boolean) {
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  const body = JSON.stringify({ device_id: getDeviceId(), events: batch });
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) { navigator.sendBeacon("/api/events", body); }
  else { fetch("/api/events", { method: "POST", body, keepalive: true }).catch(() => { /* drop on failure: events are best-effort */ }); }
  if (queue.length) send(useBeacon);
}

export function track(e: TrackEvent) {
  queue.push({ ...e, client_ts: new Date().toISOString() });
  if (queue.length >= 20) { send(false); return; }
  if (!timer) timer = setTimeout(() => { timer = null; send(false); }, 5000);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => send(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(true); });
}

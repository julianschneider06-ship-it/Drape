// Anonymous device id: random UUID kept in localStorage AND a cookie (either one restores the other).
const KEY = "drape.device";
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
const fromCookie = () => document.cookie.split("; ").find((c) => c.startsWith(`${KEY}=`))?.split("=")[1];

export function getDeviceId(): string {
  let id: string | null | undefined = null;
  try { id = localStorage.getItem(KEY); } catch { /* private mode */ }
  id = id || fromCookie() || uuid();
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  document.cookie = `${KEY}=${id}; max-age=31536000; path=/; samesite=lax`;
  return id;
}

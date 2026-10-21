// Per-device ban list of recently served SINGLE products (never outfits). A product enters when it is served in a page (at composition time).
// Limits are per group (slot, accessory type): at most `fraction` of the group is banned at once and at most `overall` ids are remembered.
// Storage: one int32 array per device (oldest first), base64 for transport.
import { COMPOSE } from "./compose-config";
import type { Catalogue } from "./catalogue";

export class BanState {
  ids: number[];
  constructor(ids: number[] = []) { this.ids = ids; }
  static fromBase64(b64: string | null): BanState {
    if (!b64) return new BanState();
    const buf = Buffer.from(b64, "base64"); const out = new Array<number>(buf.length >> 2);
    for (let i = 0; i < out.length; i++) out[i] = buf.readInt32LE(i * 4);
    return new BanState(out);
  }
  toBase64(): string { const buf = Buffer.alloc(this.ids.length * 4); this.ids.forEach((v, i) => buf.writeInt32LE(v, i * 4)); return buf.toString("base64"); }
  /** record served products (re-served ones move to the newest end) */
  push(ids: number[], overall: number = COMPOSE.ban.overall) {
    const set = new Set(ids);
    this.ids = this.ids.filter((x) => !set.has(x)); this.ids.push(...ids);
    const over = this.ids.length - overall; if (over > 0) this.ids.splice(0, over);
  }
  /** group of a product for the limits: slot for main pieces, "acc:<type>" for accessories */
  static group(cat: Catalogue, id: number): string | null {
    const p = cat.byId.get(id); if (p) return p.slot;
    const a = cat.accById.get(id); return a ? `acc:${a.type}` : null;
  }
  /** effective ban set for a gender: per group only the newest `fraction x group size` entries count */
  effective(cat: Catalogue, gender: "women" | "men", fraction: number = COMPOSE.ban.fraction): { banned: Set<number>; age: Map<number, number> } {
    const banned = new Set<number>(), age = new Map<number, number>(), count = new Map<string, number>();
    for (let i = this.ids.length - 1; i >= 0; i--) {
      const id = this.ids[i], g = BanState.group(cat, id); if (!g) continue;
      const size = cat.groupSize.get(`${gender}:${g}`) ?? 0; if (!size) continue;
      const limit = Math.max(1, Math.floor(size * fraction)), c = count.get(g) ?? 0;
      if (c < limit) { banned.add(id); age.set(id, this.ids.length - 1 - i); count.set(g, c + 1); }   // age 0 = newest
    }
    return { banned, age };
  }
}

/** Soft fallback: filter banned ids out, but if fewer than `minPool` remain, release the oldest bans first until there are enough. */
export const banStats = { releases: 0, calls: 0 };   // simulation counters: how often the soft fallback had to release bans
export function allowed<T extends { id: number }>(list: T[], eff: { banned: Set<number>; age: Map<number, number> }, minPool: number): T[] {
  const ok = list.filter((x) => !eff.banned.has(x.id)); banStats.calls++;
  if (ok.length >= minPool) return ok;
  banStats.releases++;
  const banned = list.filter((x) => eff.banned.has(x.id)).sort((a, b) => (eff.age.get(b.id) ?? 0) - (eff.age.get(a.id) ?? 0));   // oldest (largest age) first
  return [...ok, ...banned.slice(0, minPool - ok.length)];
}

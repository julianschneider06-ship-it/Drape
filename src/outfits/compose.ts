// Dynamic outfit composer (prototype). compose(profile, ban, n) builds n outfits from the in-memory catalogue on demand.
// It REUSES the existing builder: toPiece (catalogue), scoreOutfit / outfitStyle (score.ts, same minimum score and hard rules), pairScore /
// StreakGuard (pool-shared.ts), chooseAccessories / outfitCtx (accessories.ts), computeLayout (layout engine) and the shared season function.
// New here: anchor + weighted completion by taste, ban list with soft fallback, deliberate contrast patterns, session streak rules, hash ids.
import { STYLE_KEYS } from "../classify/styles";
import { garmentClass } from "../lib/layout/config";
import { computeLayout, type AccIn, type PieceIn, type SlotName } from "../lib/layout/engine";
import { chooseAccessories, outfitCtx, type Usage } from "./accessories";
import { allowed, BanState } from "./ban";
import type { CatAcc, Catalogue, CatPiece } from "./catalogue";
import { COMPOSE, type Bucket } from "./compose-config";
import { pairScore, StreakGuard, type Rnd } from "./pool-shared";
import { outfitStyle, scoreOutfit, type Piece } from "./score";
import { outfitSeason, seasonRole, type SeasonResult, type SeasonPiece } from "./season";
import { connBonus, tasteMatch, type Taste } from "./taste";

export interface Profile { gender: "women" | "men"; taste: Taste | null; contrastShare?: number; mix?: Record<Bucket, number>; accessories?: boolean; now?: Date; minScore?: number; likedIds?: Set<number>; banFraction?: number }
export interface ComposedAcc { id: number; type: string; placement: string; zone: string; score: number }
export interface ComposedOutfit {
  kind: "three" | "full"; ids: number[]; acc: ComposedAcc[]; score: number; style: string; season: SeasonResult; bucket: Bucket; pattern?: string; hash: number;
  layoutOk: boolean; attempts: number;
}
export interface Session { guard: StreakGuard; uses: Map<number, number>; acc: Usage; served: number }
export const newSession = (): Session => ({ guard: new StreakGuard(COMPOSE.session), uses: new Map(), acc: { uses: new Map(), recentIds: [], recentStores: [] }, served: 0 });
export interface ComposeStats { ms: number; attempts: number; rejects: Record<string, number>; buckets: Record<string, number> }

/** deterministic outfit id from the pieces: 52-bit hash of the sorted slot:id list, always >= 2^51 so it never collides with pool ids (small integers) */
export function outfitHash(ids: { slot: string; id: number }[]): number {
  const s = ids.map((x) => `${x.slot}:${x.id}`).sort().join("|");
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 + c + 0x7f4a7c15, 0x85ebca6b); h2 ^= h2 >>> 13; }
  return 2 ** 51 + (((h1 >>> 0) & 0x7ffff) * 2 ** 32 + (h2 >>> 0));
}

const SPORTY = ["sporty", "athleisure", "streetwear", "skater", "retro_sport", "gorpcore"].map((k) => STYLE_KEYS.indexOf(k as never));
const sportyness = (p: Piece) => SPORTY.reduce((a, i) => a + p.vec[i], 0);
/** deliberate style breaks (named patterns): predicates for the anchor slot and the partner slot */
export const CONTRAST_PATTERNS: { name: string; anchor: "shoes" | "bottom" | "top"; partner: "bottom" | "shoes"; a: (p: CatPiece) => boolean; b: (p: CatPiece) => boolean }[] = [
  { name: "smart shoes + relaxed bottom", anchor: "shoes", partner: "bottom", a: (p) => p.formality >= 0.65, b: (p) => p.formality <= 0.4 && (p.looseOk || p.volume >= 0.5) },
  { name: "tailored bottom + sporty shoes", anchor: "bottom", partner: "shoes", a: (p) => p.formality >= 0.6, b: (p) => sportyness(p) >= 0.6 },
  { name: "formal top + relaxed bottom", anchor: "top", partner: "bottom", a: (p) => p.formality >= 0.6, b: (p) => p.formality <= 0.35 && (p.looseOk || p.volume >= 0.4) },
  { name: "sporty top + tailored bottom", anchor: "top", partner: "bottom", a: (p) => sportyness(p) >= 0.6, b: (p) => p.formality >= 0.6 },
];

const BOOTS = /\b(boots?|chelsea|hiker)\b/i;
/** bottom length vs shoes: short bottoms (shorts, mini skirts) never with boots */
const lengthShoeOk = (bottom: CatPiece | undefined, shoes: CatPiece) => !(bottom?.short && BOOTS.test(`${shoes.sub} ${shoes.name}`));

function pick<T>(items: T[], w: (x: T) => number, rnd: Rnd): T | null {
  let tot = 0; const ws = items.map((x) => { const v = Math.max(0, w(x)); tot += v; return v; });
  if (!items.length) return null; if (tot <= 0) return items[Math.floor(rnd() * items.length)];
  let r = rnd() * tot; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function sample<T>(list: T[], k: number, rnd: Rnd): T[] {
  if (list.length <= k) return list;
  const a = list.slice(); for (let i = 0; i < k; i++) { const j = i + Math.floor(rnd() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k);
}

/** layout validator: the outfit must lay out without dropping or losing anything (same engine as the feed, canvas 390 x 700) */
export function layoutCheck(cat: Catalogue, kind: "three" | "full", ps: CatPiece[], acc: ComposedAcc[]): boolean {
  try {
    const pieces: Partial<Record<SlotName, PieceIn>> = {};
    for (const p of ps) { const slot: SlotName = p.slot === "full_body" ? "full" : (p.slot as SlotName); pieces[slot] = { slot, cls: garmentClass(slot as "top" | "bottom" | "shoes" | "full", p.name), aspect: p.aspect, presentation: p.presentation, hem: p.hem, waist: p.waist, collar: p.collar, hood: p.hood, fill: p.fill }; }
    const accessories: AccIn[] = acc.slice(0, 3).map((a, i) => { const c = cat.accById.get(a.id)!; return { slot: `acc${i + 1}` as AccIn["slot"], type: a.type, size: c.size ?? null, aspect: c.aspect, placement: a.placement as AccIn["placement"], zone: a.zone, frontFlat: c.frontFlat, beltShape: c.beltShape }; });
    const L = computeLayout({ kind, pieces, seed: 1, canvas: { w: 390, h: 700 }, accessories });
    if (L.debug?.acc?.dropped.length) return false;
    return L.pieces.every((x) => x.rect.x >= -1 && x.rect.y >= -1 && x.rect.x + x.rect.w <= 391 && x.rect.y + x.rect.h <= 701 && x.rect.w > 4 && x.rect.h > 4);
  } catch { return false; }
}

export function compose(cat: Catalogue, profile: Profile, banIn: BanState, n = 6, session: Session = newSession(), rnd: Rnd = Math.random): { outfits: ComposedOutfit[]; ban: BanState; session: Session; stats: ComposeStats } {
  const t0 = performance.now();
  const g = profile.gender, taste = profile.taste && profile.taste.n >= 5 ? profile.taste : null, guest = !taste;
  const minScore = profile.minScore ?? COMPOSE.minScore;
  const mix = profile.mix ?? (guest ? COMPOSE.guestMix : COMPOSE.mix);
  const contrastShare = profile.contrastShare ?? mix.contrast;
  const buckets: [Bucket, number][] = [["match", mix.match], ["near", mix.near], ["new", mix.new], ["contrast", contrastShare]];
  const eff = banIn.effective(cat, g, profile.banFraction);
  if (profile.likedIds && !COMPOSE.likesBanned) for (const id of profile.likedIds) eff.banned.delete(id);
  const stats: ComposeStats = { ms: 0, attempts: 0, rejects: {}, buckets: {} };
  const rej = (k: string) => { stats.rejects[k] = (stats.rejects[k] ?? 0) + 1; };
  const now = profile.now ?? new Date(), curSeason = [2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][now.getMonth()] ?? 1;
  const slots = ["top", "bottom", "shoes", "full_body"] as const;

  // taste bands per slot (percentile of the taste match over the gender's pieces of that slot), computed once per call
  const tm = (p: CatPiece) => tasteMatch(taste, p);
  const bandCut: Record<string, [number, number]> = {};
  if (taste) for (const s of slots) { const l = cat.index.get(`${g}:${s}`); if (!l) continue; const v = Array.from(l, (i) => tm(cat.pieces[i])).sort((a, b) => b - a); bandCut[s] = [v[Math.floor(v.length * COMPOSE.bands.match)] ?? 1, v[Math.floor(v.length * COMPOSE.bands.near)] ?? 0]; }
  const bandOf = (p: CatPiece): Bucket => { const c = bandCut[p.slot]; if (!c) return "new"; const v = tm(p); return v >= c[0] ? "match" : v >= c[1] ? "near" : "new"; };
  const cand = (slot: string, season: number): CatPiece[] => {
    const l = cat.index.get(`${g}:${slot}:${season}`) ?? cat.index.get(`${g}:${slot}`) ?? new Int32Array(0);
    return allowed(Array.from(l, (i) => cat.pieces[i]), eff, COMPOSE.ban.minPool);
  };
  const fresh = (p: CatPiece) => 1 / (1 + COMPOSE.freshnessPerUse * (session.uses.get(p.id) ?? 0));
  const tasteW = (p: CatPiece) => 1 - COMPOSE.tasteWeight + COMPOSE.tasteWeight * (guest ? 0.5 : tm(p));
  const fullShare = Math.min(0.5, ((cat.index.get(`${g}:full_body`)?.length ?? 0) / Math.max(1, (cat.index.get(`${g}:top`)?.length ?? 1))) * COMPOSE.anchorFullBoost);

  const accCands = (): CatAcc[] => {
    if (!(profile.accessories ?? COMPOSE.accessories)) return [];
    const byType = new Map<string, CatAcc[]>();
    for (const a of cat.accs) if (a.genders.includes(g)) { const l = byType.get(a.type) ?? []; l.push(a); byType.set(a.type, l); }
    const out: CatAcc[] = []; for (const l of byType.values()) out.push(...allowed(l, eff, COMPOSE.ban.minPoolAcc));
    return out;
  };
  const accPool = accCands();

  // candidate sample for a slot: with a taste profile half of the sample are the best taste matches, the other half random (keeps surprise); guests: random
  const sampleFor = (list: CatPiece[], k: number): CatPiece[] => {
    if (list.length <= k) return list;
    if (guest) return sample(list, k, rnd);
    const sorted = [...list].sort((a, b) => tm(b) - tm(a)), head = sorted.slice(0, k >> 1);
    return [...head, ...sample(sorted.slice(k >> 1), k - (k >> 1), rnd)];
  };
  const buildOne = (bucket: Bucket): { ps: CatPiece[]; kind: "three" | "full"; score: number; pattern?: string } | null => {
    const minS = bucket === "contrast" ? COMPOSE.contrastMinScore : minScore;
    const sSeason = ((): number => { const r = rnd(); const cur = COMPOSE.seasonWeightCurrent; if (r < cur) return curSeason; const o = [0, 1, 2, 3].filter((x) => x !== curSeason); return o[Math.floor((r - cur) / ((1 - cur) / 3)) % 3]; })();
    const bandW = (p: CatPiece) => (guest || bucket === "contrast" ? 1 : bandOf(p) === bucket ? 1 : COMPOSE.bandWeightOutside);
    let anchorSlot: "top" | "bottom" | "shoes" | "full_body", pat: (typeof CONTRAST_PATTERNS)[number] | undefined;
    let anchor: CatPiece | null;
    if (bucket === "contrast") {
      pat = CONTRAST_PATTERNS[Math.floor(rnd() * CONTRAST_PATTERNS.length)]; anchorSlot = pat.anchor;
      anchor = pick(cand(anchorSlot, sSeason).filter(pat.a), (p) => fresh(p) * (0.5 + tasteW(p)), rnd);
    } else {
      const w = { top: COMPOSE.anchorSlot.top, bottom: COMPOSE.anchorSlot.bottom, shoes: COMPOSE.anchorSlot.shoes, full_body: fullShare } as const;
      anchorSlot = pick(["top", "bottom", "shoes", "full_body"] as const, (s) => w[s], rnd)!;
      anchor = pick(cand(anchorSlot, sSeason), (p) => fresh(p) * bandW(p), rnd);
    }
    if (!anchor) return null;
    if (anchorSlot === "full_body") {
      const shoes = cand("shoes", sSeason); const sc: [CatPiece, number][] = [];
      for (const s of sampleFor(shoes, COMPOSE.shoeSample)) { const r = scoreOutfit([anchor, s]); if (r && r.score >= minS) sc.push([s, r.score]); }
      sc.sort((a, b) => b[1] - a[1]); const top = sc.slice(0, COMPOSE.topN);
      const ch = pick(top, ([s, v]) => Math.pow(v, COMPOSE.scoreExponent) * tasteW(s) * (1 + COMPOSE.connectionWeight * connBonus(taste, anchor!, s)) * fresh(s), rnd);
      return ch ? { ps: [anchor, ch[0]], kind: "full", score: ch[1] } : null;
    }
    // second slot by pair proxy (top/bottom or shoes/bottom), third slot by the full outfit score
    const second = anchorSlot === "top" ? "bottom" : anchorSlot === "bottom" ? "top" : "bottom";
    const third = (["top", "bottom", "shoes"] as const).find((s) => s !== anchorSlot && s !== second)!;
    let secL = cand(second, sSeason);
    if (pat && pat.partner === second) secL = secL.filter(pat.b);
    const sec: [CatPiece, number][] = [];
    for (const y of sampleFor(secL, COMPOSE.partnerSample)) { const s = pairScore(anchor, y, rnd); if (s > 0) sec.push([y, s]); }
    sec.sort((a, b) => b[1] - a[1]);
    const secPick = pick(sec.slice(0, COMPOSE.pairK), ([y, v]) => Math.pow(v, COMPOSE.scoreExponent) * tasteW(y) * (1 + COMPOSE.connectionWeight * connBonus(taste, anchor!, y)) * fresh(y), rnd);
    if (!secPick) return null;
    const y = secPick[0];
    let thirdL = cand(third, sSeason);
    if (pat && pat.partner === third) thirdL = thirdL.filter(pat.b);
    const trio = (z: CatPiece) => { const o = [anchor!, y, z]; const by = (s: string) => o.find((p) => p.slot === s)!; return [by("top"), by("bottom"), by("shoes")]; };
    const fin: [CatPiece, number][] = [];
    for (const z of sampleFor(thirdL, COMPOSE.shoeSample)) {
      const ps = trio(z); if (!lengthShoeOk(ps[1], ps[2])) { rej("candidate:length-shoes"); continue; }
      const r = scoreOutfit(ps); if (r && r.score >= minS) fin.push([z, r.score]);
    }
    fin.sort((a, b) => b[1] - a[1]);
    const fp = pick(fin.slice(0, COMPOSE.topN), ([z, v]) => Math.pow(v, COMPOSE.scoreExponent) * tasteW(z) * (1 + COMPOSE.connectionWeight * connBonus(taste, third === "shoes" ? y.slot === "bottom" ? y : anchor! : anchor!, z)) * fresh(z), rnd);
    if (!fp) return null;
    return { ps: trio(fp[0]), kind: "three", score: fp[1], pattern: pat?.name };
  };

  const outfits: ComposedOutfit[] = [];
  const ban = new BanState([...banIn.ids]);
  for (let k = 0; k < n; k++) {
    let done: ComposedOutfit | null = null;
    const wanted = pick(buckets.filter(([, v]) => v > 0), ([, v]) => v, rnd)![0];   // the bucket is drawn once per outfit; a contrast outfit retries its pattern a few times before giving up
    for (let attempt = 0; attempt < COMPOSE.attempts + 4 && !done; attempt++) {
      stats.attempts++;
      const level = attempt < COMPOSE.attempts ? 0 : 1;      // after the strict attempts only the "no repeated product" rule stays
      const bucket: Bucket = wanted === "contrast" && attempt >= 7 ? "new" : wanted;
      const b = buildOne(bucket);
      if (!b) { rej("no-candidate"); continue; }
      const ids = b.ps.map((p) => p.id);
      const style = outfitStyle(b.ps);
      if (!session.guard.ok(ids, style, b.ps[0].store, level)) { rej("streak"); continue; }
      // accessories: the existing selection rules
      let acc: ComposedAcc[] = [];
      if (accPool.length) {
        const ctx = outfitCtx(g, b.ps as Piece[], b.ps.map((p) => `${p.name} ${p.sub}`));
        const picks = chooseAccessories(ctx, accPool, session.acc);
        acc = picks.map((p) => ({ id: p.acc.id, type: p.acc.type, placement: p.placement, zone: p.zone, score: +p.score.toFixed(3) }));
      }
      if (!layoutCheck(cat, b.kind, b.ps, acc)) { rej("layout"); continue; }
      const roles: SeasonPiece[] = [...b.ps.map((p) => ({ mask: p.mask, role: seasonRole(p.slot, `${p.name} ${p.sub}`, p.outer, p.cold, p.warm) })), ...acc.map((a) => { const c = cat.accById.get(a.id)!; return { mask: c.mask, role: seasonRole("accessory", "", false, false, false, a.type) }; })];
      const season = outfitSeason(roles);
      const slotIds = b.ps.map((p) => ({ slot: p.slot, id: p.id })), accIds = acc.map((a) => ({ slot: `acc:${a.type}`, id: a.id }));
      done = { kind: b.kind, ids, acc, score: +b.score.toFixed(4), style, season, bucket, pattern: b.pattern, hash: outfitHash([...slotIds, ...accIds]), layoutOk: true, attempts: attempt + 1 };
      // commit to the session + bans (at composition time)
      session.guard.push(ids, style, b.ps[0].store);
      for (const p of b.ps) session.uses.set(p.id, (session.uses.get(p.id) ?? 0) + 1);
      session.acc.recentIds.push(acc.map((a) => a.id)); session.acc.recentStores.push(acc.map((a) => cat.accById.get(a.id)!.store));
      if (session.acc.recentIds.length > 14) { session.acc.recentIds.shift(); session.acc.recentStores.shift(); }
      for (const a of acc) session.acc.uses.set(a.id, (session.acc.uses.get(a.id) ?? 0) + 1);
      const served = [...ids, ...acc.map((a) => a.id)]; ban.push(served);
      for (const id of served) { eff.banned.add(id); eff.age.set(id, 0); }
      session.served++;
      stats.buckets[bucket] = (stats.buckets[bucket] ?? 0) + 1;
    }
    if (done) outfits.push(done);
  }
  stats.ms = performance.now() - t0;
  return { outfits, ban, session, stats };
}

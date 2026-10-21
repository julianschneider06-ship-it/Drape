// Shared by the stored-alternatives job (scripts/build-alternatives.ts) and the dynamic composer: the swap-loop pair rule.
export interface Cnd { product_id: number; brand: string; score: number; main: string; vec: Float32Array }
const dotv = (a: Float32Array, b: Float32Array) => { let x = 0; for (let i = 0; i < a.length; i++) x += a[i] * b[i]; return x; };
/** The swap loop shows the original + 2 alternatives: the best one, and the best other one that is visibly different from it
 *  (other brand, other main colour, not a near-duplicate in style); conditions are relaxed step by step if nothing qualifies. */
export function pickPair<T extends Cnd>(sorted: T[]): T[] {
  if (sorted.length < 2) return sorted.slice(0, 2);
  const a = sorted[0]; const pool = sorted.slice(1, 14);
  const tests: ((b: T) => boolean)[] = [
    (b) => b.brand !== a.brand && b.main !== a.main && dotv(a.vec, b.vec) < 0.96,
    (b) => b.main !== a.main && dotv(a.vec, b.vec) < 0.96,
    (b) => b.brand !== a.brand && dotv(a.vec, b.vec) < 0.96,
    (b) => dotv(a.vec, b.vec) < 0.96, () => true,
  ];
  for (const t of tests) { const b = pool.find(t); if (b) return [a, b]; }
  return [a];
}

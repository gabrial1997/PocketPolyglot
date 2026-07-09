// Pure band math for the Progress screen: bucket known frequency ranks (1-based) into the four
// mockup coverage bands. No services, no clock — unit-tested directly (Tier-B screens stay pure).
export interface CoverageBand {
  label: string;
  sub: string;
  known: number;
  total: number;
  /** round(100 * known / total); 0 when the band has no words in the corpus. */
  pct: number;
}

/** The four bands from the design mockup. `hi` = inclusive upper rank cutoff. */
export const BAND_DEFS = [
  { label: 'Top 100', sub: 'the everyday core', hi: 100 },
  { label: '101 – 300', sub: 'common conversation', hi: 300 },
  { label: '301 – 600', sub: 'broader topics', hi: 600 },
  { label: '601 – 1000', sub: 'fuller fluency', hi: 1000 },
] as const;

/**
 * computeBands — per-band coverage from the learner's known ranks.
 * Band totals derive from the cutoffs clamped to `total` (a corpus smaller than 1,000 shrinks
 * the tail bands rather than inventing unreachable words). Ranks outside [1, total] are ignored.
 */
export function computeBands(knownRanks: readonly number[], total: number): CoverageBand[] {
  let lo = 1;
  return BAND_DEFS.map((def) => {
    const hi = Math.min(def.hi, total);
    const bandTotal = Math.max(0, hi - lo + 1);
    const known = knownRanks.filter((r) => r >= lo && r <= hi).length;
    lo = def.hi + 1;
    return {
      label: def.label,
      sub: def.sub,
      known,
      total: bandTotal,
      pct: bandTotal > 0 ? Math.round((100 * known) / bandTotal) : 0,
    };
  });
}

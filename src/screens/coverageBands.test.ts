// computeBands — pure band math for the Progress screen (spec 2026-07-06 §3).
import { computeBands, BAND_DEFS } from './coverageBands';

const ranks = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('computeBands', () => {
  it('no known ranks → every band at 0%, totals from the cutoffs', () => {
    const bands = computeBands([], 1000);
    expect(bands.map((b) => b.pct)).toEqual([0, 0, 0, 0]);
    expect(bands.map((b) => b.total)).toEqual([100, 200, 300, 400]);
    expect(bands.map((b) => b.label)).toEqual(BAND_DEFS.map((d) => d.label));
  });

  it('ranks 1..100 → Top 100 complete, the rest untouched', () => {
    const bands = computeBands(ranks(1, 100), 1000);
    expect(bands[0]).toMatchObject({ known: 100, total: 100, pct: 100 });
    expect(bands.slice(1).map((b) => b.known)).toEqual([0, 0, 0]);
  });

  it('ranks 1..250 → 100% / 75% / 0% / 0%', () => {
    const bands = computeBands(ranks(1, 250), 1000);
    expect(bands.map((b) => b.pct)).toEqual([100, 75, 0, 0]);
  });

  it('buckets cutoff edges correctly (300 → band 2, 301 → band 3, 1000 → band 4)', () => {
    const bands = computeBands([300, 301, 1000], 1000);
    expect(bands.map((b) => b.known)).toEqual([0, 1, 1, 1]);
  });

  it('rounds partial coverage (42 of the top 100 → 42%)', () => {
    const bands = computeBands(ranks(1, 42), 1000);
    expect(bands[0]).toMatchObject({ known: 42, pct: 42 });
  });

  it('a smaller corpus clamps band totals instead of inventing words', () => {
    const bands = computeBands(ranks(1, 150), 400);
    expect(bands.map((b) => b.total)).toEqual([100, 200, 100, 0]);
    expect(bands.map((b) => b.pct)).toEqual([100, 25, 0, 0]);
  });

  it('ignores ranks outside [1, total]', () => {
    const bands = computeBands([0, -5, 1001, 50], 1000);
    expect(bands.map((b) => b.known)).toEqual([1, 0, 0, 0]);
  });
});

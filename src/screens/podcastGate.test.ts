// Behavior test for the podcast unlock gate (spec 2026-07-09 §1). Pure math, no services —
// pins the boundary (>= 25% unlocks) and the fail-closed empty-corpus case.
import { PODCAST_UNLOCK_COVERAGE, podcastLocked } from './podcastGate';

const cov = (known: number, total = 1000) => ({ total, knownRanks: Array.from({ length: known }, (_, i) => i + 1) });

describe('podcastLocked', () => {
  it('locks below 25%', () => {
    expect(podcastLocked(cov(0))).toBe(true);
    expect(podcastLocked(cov(249))).toBe(true);
  });
  it('unlocks at exactly 25% and above (boundary is >=)', () => {
    expect(podcastLocked(cov(250))).toBe(false);
    expect(podcastLocked(cov(1000))).toBe(false);
  });
  it('never divides by zero — an empty corpus stays locked', () => {
    expect(podcastLocked({ total: 0, knownRanks: [] })).toBe(true);
  });
  it('exposes the threshold as a single named constant', () => {
    expect(PODCAST_UNLOCK_COVERAGE).toBe(0.25);
  });
});

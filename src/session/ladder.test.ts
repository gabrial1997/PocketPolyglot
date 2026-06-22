import { computeRung, translationVisibilityForRung } from './ladder';

describe('computeRung', () => {
  it('returns recognition when below receptive floor (2 receptive, 0 productive)', () => {
    expect(computeRung(2, 0)).toBe('recognition');
  });

  it('returns recall when receptiveReps meets floor (3 receptive, 0 productive)', () => {
    expect(computeRung(3, 0)).toBe('recall');
  });

  it('returns recall when above receptive floor but below production floor (5 receptive, 0 productive)', () => {
    // Sub-track is independent: high receptive does NOT grant production
    expect(computeRung(5, 0)).toBe('recall');
  });

  it('returns production when productiveReps meets production floor (5 receptive, 6 productive)', () => {
    expect(computeRung(5, 6)).toBe('production');
  });

  it('returns production even with low receptiveReps when productiveReps meets floor (0 receptive, 6 productive)', () => {
    // Production reachable with low receptive — depends ONLY on productiveReps
    expect(computeRung(0, 6)).toBe('production');
  });
});

describe('translationVisibilityForRung', () => {
  it('maps recognition to auto', () => {
    expect(translationVisibilityForRung('recognition')).toBe('auto');
  });

  it('maps recall to hint', () => {
    expect(translationVisibilityForRung('recall')).toBe('hint');
  });

  it('maps production to on-demand', () => {
    expect(translationVisibilityForRung('production')).toBe('on-demand');
  });
});

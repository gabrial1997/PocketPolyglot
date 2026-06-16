import { lockState } from './phraseGate';

test('locked when 2+ components are unknown', () => {
  const known = new Set<string>(['ludzu']);
  const r = lockState(['viens', 'kafija', 'ludzu'], known);
  expect(r.locked).toBe(true);
  expect(r.unknownCount).toBe(2);
});

test('available (i+1) when exactly one component is unknown', () => {
  const known = new Set<string>(['viens', 'ludzu']);
  const r = lockState(['viens', 'kafija', 'ludzu'], known);
  expect(r.locked).toBe(false);
  expect(r.unknownCount).toBe(1);
});

test('available when all known', () => {
  const known = new Set<string>(['viens', 'kafija', 'ludzu']);
  expect(lockState(['viens', 'kafija', 'ludzu'], known).locked).toBe(false);
});

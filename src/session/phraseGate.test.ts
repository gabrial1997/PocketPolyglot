import { lockState } from './phraseGate';

const known = new Set(['a', 'b']);

it('is locked while ANY component word is unknown (all-words-known gate)', () => {
  expect(lockState(['a', 'b', 'c'], known)).toEqual({ locked: true, unknownCount: 1 });
  expect(lockState(['a', 'c', 'd'], known)).toEqual({ locked: true, unknownCount: 2 });
});

it('is available only when every component word is known', () => {
  expect(lockState(['a', 'b'], known)).toEqual({ locked: false, unknownCount: 0 });
});

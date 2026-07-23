// Guards the CardKind -> DbItemType mapping in SupabaseSrsService.submit().
// This resolver is the SOLE way submit() derives review_state.item_type (CardResult carries
// only cardKind + itemId), so a wrong branch silently writes the wrong item_type and corrupts
// scheduling. The regression that motivated this: the 'diphthong' drill fell through to the
// 'lemma' fallback instead of mapping to 'pair'.
//
// We force every CardKind to be covered via a compile-time-exhaustive `Record<CardKind, ...>`:
// add a new CardKind to the union and TS fails to compile this file until it's mapped here.
// (We can't import the runtime CARD_REGISTRY: it transitively imports React Native screen
// components, which this "logic" jest project — ts-jest/node — can't transform.)
import type { CardKind } from '../../types/cardKind';
import type { DbItemType } from './types';
import { cardKindToDbType } from './SupabaseSrsService';

// Exhaustive by construction: `Record<CardKind, DbItemType>` makes TS fail to compile if any
// CardKind is missing. This is the canonical list the test iterates.
const EXPECTED: Record<CardKind, DbItemType> = {
  'word/learn-concrete': 'lemma',
  'word/learn-abstract': 'lemma',
  'word/learn-function': 'lemma',
  'word/pic-review': 'lemma',
  'word/hear': 'lemma',
  'word/say': 'lemma',
  'word/recall': 'lemma',
  'phrase/locked': 'phrase',
  'phrase/unlock': 'phrase',
  'phrase/hear': 'phrase',
  'phrase/meaning': 'phrase',
  'phrase/sayit': 'phrase',
  drill: 'pair',
  diphthong: 'pair',
  pron: 'pair',
};

const ALL_CARD_KINDS = Object.keys(EXPECTED) as CardKind[];

describe('cardKindToDbType', () => {
  it('maps every registered CardKind to its expected DbItemType', () => {
    expect(ALL_CARD_KINDS.length).toBeGreaterThan(0);
    for (const kind of ALL_CARD_KINDS) {
      expect(cardKindToDbType(kind)).toBe(EXPECTED[kind]);
    }
  });

  it.each(ALL_CARD_KINDS)('routes %s correctly', (kind) => {
    expect(cardKindToDbType(kind)).toBe(EXPECTED[kind]);
  });

  // The regression: the 'ie' diphthong drill emits CardKind 'diphthong', which is backed by a
  // minimal_pairs row (item_type 'pair'). It previously hit the 'lemma' fallback.
  it("maps 'diphthong' to 'pair' (regression)", () => {
    expect(cardKindToDbType('diphthong')).toBe('pair');
  });

  it("maps 'drill' and 'pron' to 'pair'", () => {
    expect(cardKindToDbType('drill')).toBe('pair');
    expect(cardKindToDbType('pron')).toBe('pair');
  });

  it('only word/* kinds resolve to the lemma fallback among real CardKinds', () => {
    for (const kind of ALL_CARD_KINDS) {
      if (cardKindToDbType(kind) === 'lemma') {
        expect(kind.startsWith('word')).toBe(true);
      }
    }
  });

  it('falls back to lemma for an unknown kind', () => {
    expect(cardKindToDbType('totally-unknown-kind')).toBe('lemma');
  });
});

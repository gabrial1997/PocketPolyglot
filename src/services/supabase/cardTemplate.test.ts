import { cardKindToTemplate, repKind } from './cardTemplate';

describe('cardKindToTemplate', () => {
  it('maps production (spoken) card kinds to pronunciation', () => {
    expect(cardKindToTemplate('word/say')).toBe('pronunciation');
    expect(cardKindToTemplate('phrase/sayit')).toBe('pronunciation');
    expect(cardKindToTemplate('pron')).toBe('pronunciation');
  });

  it('maps every other card kind to recognition', () => {
    expect(cardKindToTemplate('word/hear')).toBe('recognition');
    expect(cardKindToTemplate('word/learn-concrete')).toBe('recognition');
    expect(cardKindToTemplate('phrase/meaning')).toBe('recognition');
    expect(cardKindToTemplate('drill')).toBe('recognition');
  });

  // word/recall (spec 2026-07-23 §4): submit() short-circuits before this is ever consulted at
  // runtime, but it must still resolve to 'recognition' — never 'pronunciation' — for consistency.
  it('maps the no-FSRS recall probe (word/recall) to recognition', () => {
    expect(cardKindToTemplate('word/recall')).toBe('recognition');
  });
});

describe('repKind — the single rep-counting rule', () => {
  it('counts a production card as productive on COMPLETION, regardless of correct', () => {
    expect(repKind('word/say', true)).toBe('productive');
    expect(repKind('word/say', false)).toBe('productive');
    expect(repKind('word/say', null)).toBe('productive');
    expect(repKind('phrase/sayit', null)).toBe('productive');
    expect(repKind('pron', undefined)).toBe('productive');
  });
  it('counts a non-production card as receptive only when correct', () => {
    expect(repKind('word/hear', true)).toBe('receptive');
    expect(repKind('word/hear', false)).toBeNull();
    expect(repKind('phrase/meaning', true)).toBe('receptive');
    expect(repKind('word/learn-concrete', null)).toBeNull(); // exposure ≠ rep
  });

  // word/recall (spec 2026-07-23 §4): a correct no-FSRS recall probe must classify receptive —
  // the SAME bucket as word/hear — so a word earned via a probe still climbs the ladder rung.
  it('counts a correct no-FSRS recall probe (word/recall) as receptive, same bucket as word/hear', () => {
    expect(repKind('word/recall', true)).toBe('receptive');
    expect(repKind('word/recall', false)).toBeNull();
    expect(repKind('word/recall', null)).toBeNull();
  });
});

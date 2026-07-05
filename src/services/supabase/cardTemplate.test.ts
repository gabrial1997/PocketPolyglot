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
});

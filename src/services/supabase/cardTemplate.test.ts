import { cardKindToTemplate } from './cardTemplate';

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

import { computeEarned, type EarnedLogRow } from './earned';

const intro = (id: string, session: string | null, at: string): EarnedLogRow => ({
  item_id: id, card_kind: 'word/learn-function', correct: null, session_id: session, created_at: at,
});
const hear = (id: string, session: string | null, at: string, correct = true): EarnedLogRow => ({
  item_id: id, card_kind: 'word/hear', correct, session_id: session, created_at: at,
});
const recall = (id: string, session: string | null, at: string, correct = true): EarnedLogRow => ({
  item_id: id, card_kind: 'word/recall', correct, session_id: session, created_at: at,
});
const say = (id: string, session: string | null, at: string): EarnedLogRow => ({
  item_id: id, card_kind: 'word/say', correct: true, session_id: session, created_at: at,
});

describe('computeEarned', () => {
  it('same-session correct does NOT earn', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      hear('a', 's1', '2026-07-23T10:00:05Z'),
    ]).has('a')).toBe(false);
  });

  it('different-session same-day correct earns (rounds)', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      recall('a', 's2', '2026-07-23T12:00:00Z'),
    ]).has('a')).toBe(true);
  });

  it('later-day correct earns even with null session ids (legacy / time travel)', () => {
    expect(computeEarned([
      intro('a', null, '2026-07-22T10:00:00Z'),
      hear('a', null, '2026-07-23T09:00:00Z'),
    ]).has('a')).toBe(true);
  });

  it('same-day null-vs-null sessions do NOT earn (legacy same-sitting)', () => {
    expect(computeEarned([
      intro('a', null, '2026-07-23T10:00:00Z'),
      hear('a', null, '2026-07-23T10:00:05Z'),
    ]).has('a')).toBe(false);
  });

  it('mixed null/non-null sessions same day do NOT earn (conservative: can\'t prove a different sitting)', () => {
    expect(computeEarned([
      intro('a', null, '2026-07-23T10:00:00Z'),
      hear('a', 's2', '2026-07-23T11:00:00Z'),
    ]).has('a')).toBe(false);
  });

  it('incorrect answers never earn', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      recall('a', 's2', '2026-07-23T12:00:00Z', false),
    ]).has('a')).toBe(false);
  });

  it('word/say self-ratings do not earn', () => {
    expect(computeEarned([
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      say('a', 's2', '2026-07-23T12:00:00Z'),
    ]).has('a')).toBe(false);
  });

  it('no intro row (legacy) -> any correct recognition earns', () => {
    expect(computeEarned([hear('a', 's1', '2026-07-23T10:00:00Z')]).has('a')).toBe(true);
  });

  it('earliest intro row is the anchor when several exist', () => {
    expect(computeEarned([
      intro('a', 's2', '2026-07-23T12:00:00Z'), // re-intro later
      intro('a', 's1', '2026-07-23T10:00:00Z'),
      hear('a', 's2', '2026-07-23T12:00:05Z'),
    ]).has('a')).toBe(true); // s2 !== s1 (the earliest intro)
  });
});

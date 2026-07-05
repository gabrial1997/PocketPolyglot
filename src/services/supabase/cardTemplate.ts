// Maps a CardKind to the FSRS scheduling template it grades. Production (spoken) cards train
// pronunciation; everything else trains recognition. This is the single source of truth for which
// review_state row (user_id,item_type,item_id,template) a graded result writes to.
export type ReviewTemplate = 'recognition' | 'pronunciation';

// The set of card_kinds that count as "production" (spoken) retrieval. Single source of truth —
// also consumed by SupabaseSrsService.ts (Module C2) for productiveReps/rung accounting, so the
// two never drift: a card kind counted as a productive rep and a card kind routed to the
// pronunciation schedule must always be the same set.
export const PRODUCTION_CARD_KINDS = new Set<string>(['word/say', 'phrase/sayit', 'pron']);

export function cardKindToTemplate(cardKind: string): ReviewTemplate {
  return PRODUCTION_CARD_KINDS.has(cardKind) ? 'pronunciation' : 'recognition';
}

/**
 * The single rep-counting rule (spec 2026-07-05 §3).
 * Production cards (speak steps) count on COMPLETION — they don't grade pronunciation,
 * so requiring correct===true would stall the MC↔speak rotation parity forever.
 * Non-production cards count only on a correct retrieval; ungraded exposures count nothing.
 */
export function repKind(
  cardKind: string,
  correct: boolean | null | undefined,
): 'productive' | 'receptive' | null {
  if (PRODUCTION_CARD_KINDS.has(cardKind)) return 'productive';
  return correct === true ? 'receptive' : null;
}

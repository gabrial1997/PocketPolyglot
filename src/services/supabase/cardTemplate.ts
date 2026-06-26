// Maps a CardKind to the FSRS scheduling template it grades. Production (spoken) cards train
// pronunciation; everything else trains recognition. This is the single source of truth for which
// review_state row (user_id,item_type,item_id,template) a graded result writes to.
export type ReviewTemplate = 'recognition' | 'pronunciation';

// Mirrors PRODUCTION_CARD_KINDS in SupabaseSrsService.ts (Module C2). Keep in sync.
const PRONUNCIATION_CARD_KINDS = new Set<string>(['word/say', 'phrase/sayit', 'pron']);

export function cardKindToTemplate(cardKind: string): ReviewTemplate {
  return PRONUNCIATION_CARD_KINDS.has(cardKind) ? 'pronunciation' : 'recognition';
}

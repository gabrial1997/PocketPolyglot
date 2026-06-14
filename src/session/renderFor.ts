// renderFor(item) — maps a ReviewItem to the CardKind to mount.
// Ported exactly from BACKEND_INTEGRATION.md §2. The `id`+`k` strings (= CardKind) are the
// stable analytics / deep-link keys (WIRING_MAP §1). This is the CI smoke test (renderFor.test.ts).
//
// Routing notes (WIRING_MAP §2):
//  - learn-* is shown once, only when stage === 'new'.
//  - picture words run the full loop via 'word/pic-review'.
//  - non-picture words: recognition ('hear') before reps 3, then production ('say').
//  - phrase / drill / pron route by item.type.
//  - 'phrase/locked' / 'phrase/unlock' are NOT returned here — the controller decides lock
//    state from the known-word set (BACKEND_INTEGRATION §4); this returns the *review* kind.
import type { ReviewItem } from '../types/reviewItem';
import type { ReviewCardKind } from '../types/cardKind';

export function renderFor(item: ReviewItem): ReviewCardKind {
  // New words: first exposure → the learn template chosen by word class.
  if (item.stage === 'new' && item.type === 'word') {
    if (item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.wordClass === 'function') return 'word/learn-function';
  }

  // Word reviews.
  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    return item.reps < 3 ? 'word/hear' : 'word/say'; // recognition → production
  }

  // Phrase reviews. (locked/unlock handled by the controller, not here.)
  if (item.type === 'phrase') {
    if (item.stage === 'new') return 'phrase/hear'; // first exposure
    // idioms (literal != actual) get a meaning check; otherwise mature say-it.
    return item.reps < 2 ? 'phrase/meaning' : 'phrase/sayit';
  }

  // Minimal-pair perception drill.
  if (item.type === 'pair') return 'drill';

  // Fallback: pronunciation comparison.
  return 'pron';
}

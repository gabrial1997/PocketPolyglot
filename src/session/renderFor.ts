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
  // B3: audio gate — gated kinds (word/hear, word/say, phrase/hear, phrase/sayit, drill,
  // diphthong) require a precomputed amplitude envelope. Text-only / envelope-less items
  // are introduce-only and must route to a visual surface instead.
  const hasAudio = !!item.audio?.envelope;

  // New words: first exposure → the learn template chosen by word class.
  if (item.stage === 'new' && item.type === 'word') {
    if (item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.wordClass === 'function') return 'word/learn-function';
  }

  // Word reviews.
  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    // B3 guard: audio-less words must not reach word/hear or word/say — re-show the learn
    // template (introduce-only; no audio review surface available).
    if (!hasAudio) return `word/learn-${item.wordClass ?? 'concrete'}` as ReviewCardKind;
    return item.reps < 3 ? 'word/hear' : 'word/say'; // recognition → production
  }

  // Phrase reviews. (locked/unlock handled by the controller, not here.)
  if (item.type === 'phrase') {
    // B3 guard: audio-less phrases must not reach phrase/hear or phrase/sayit.
    if (!hasAudio) return 'phrase/meaning';
    if (item.stage === 'new') return 'phrase/hear'; // first exposure
    // idiom (literal != actual) → meaning check; non-idiom → say-it.
    return item.isIdiom ? 'phrase/meaning' : 'phrase/sayit';
  }

  // Minimal-pair perception drill — a gliding combination (ie) gets the diphthong card.
  // B3 guard: drill/diphthong require audio (pair should not reach here audio-less, but guard
  // defensively per §10.2).
  if (item.type === 'pair' && hasAudio) return item.glide ? 'diphthong' : 'drill';
  // audio-less pair is never selected (Module B gates pairs on audio); defensive non-gated fallback.
  if (item.type === 'pair') return 'word/learn-concrete';

  // Fallback: pronunciation comparison.
  // Only 'pron' items (type === 'pron') can reach here, and they always have audio (Module B gate).
  return 'pron';
}

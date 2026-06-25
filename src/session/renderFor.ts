// renderFor(item) — maps a ReviewItem to the CardKind to mount.
// Ported exactly from BACKEND_INTEGRATION.md §2. The `id`+`k` strings (= CardKind) are the
// stable analytics / deep-link keys (WIRING_MAP §1). This is the CI smoke test (renderFor.test.ts).
//
// Routing notes (WIRING_MAP §2):
//  - learn-* is shown once, only when stage === 'new'.
//  - picture words run the full loop via 'word/pic-review'.
//  - non-picture words: receptive ('hear') until computeRung reaches 'production' (productiveReps
//    >= PRODUCTION_GRADUATION_FLOOR); at/above that rung, production ('say').
//  - non-idiom phrases: same rung check — 'phrase/hear' below production, 'phrase/sayit' at/above.
//    Idioms always route to 'phrase/meaning'. New phrases (stage==='new') get 'phrase/hear' first.
//  - phrase / drill / pron route by item.type.
//  - 'phrase/locked' / 'phrase/unlock' are NOT returned here — the controller decides lock
//    state from the known-word set (BACKEND_INTEGRATION §4); this returns the *review* kind.
import type { ReviewItem } from '../types/reviewItem';
import type { ReviewCardKind } from '../types/cardKind';
import { computeRung } from './ladder';

export function renderFor(item: ReviewItem): ReviewCardKind {
  // Audio gate. word/hear is now audio-OPTIONAL: it shows the written word, so audio-less words
  // are still quizzable (the play orb is silent until audio exists). The kinds that still REQUIRE
  // a precomputed amplitude envelope are word/say, phrase/hear, phrase/sayit, drill, diphthong
  // (production compares against native audio; the perception drills need the clip).
  const hasAudio = !!item.audio?.envelope;

  // New words: first exposure → the learn template chosen by word class.
  // A `retest` copy is NOT a first exposure — it falls through to the recognition quiz below.
  if (item.stage === 'new' && item.type === 'word' && !item.retest) {
    if (item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.wordClass === 'function') return 'word/learn-function';
  }

  // Word reviews + retests. Recognition (word/hear) is audio-OPTIONAL — it shows the written
  // word, so audio-less words are still quizzable (the play button is silent until audio exists).
  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    // Production (word/say) compares the learner against native audio, so it requires audio.
    if (hasAudio && computeRung(item.receptiveReps ?? 0, item.productiveReps ?? 0) === 'production') {
      return 'word/say';
    }
    return 'word/hear';
  }

  // Phrase reviews. (locked/unlock handled by the controller, not here.)
  if (item.type === 'phrase') {
    // B3 guard: audio-less phrases must not reach phrase/hear or phrase/sayit.
    if (!hasAudio) return 'phrase/meaning';
    if (item.stage === 'new') return 'phrase/hear'; // first exposure
    // idiom (literal != actual) → meaning check always.
    if (item.isIdiom) return 'phrase/meaning';
    // non-idiom: route by ladder rung — production ('sayit') only once at/above production floor.
    return computeRung(item.receptiveReps ?? 0, item.productiveReps ?? 0) === 'production'
      ? 'phrase/sayit'
      : 'phrase/hear';
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

// renderFor(item) — maps a ReviewItem to the CardKind to mount.
// The `id`+`k` strings (= CardKind) are the stable analytics / deep-link keys.
//
// Routing (core-loop reset, 2026-07-05 spec):
//  - learn-* is shown once, only when stage === 'new' and no retest marker.
//  - retest:'mc' → the MC step (word/hear, phrase/meaning); retest:'speak' → the
//    production step (word/say, phrase/sayit). Say cards are audio-OPTIONAL (silent
//    orb until audio is backfilled) but need ≥2 choices for their choose stage.
//  - due reviews ROTATE modality by total-rep parity: even → MC, odd → speak.
//    (Replaces the old production-rung gate, which was circular/unreachable.)
//  - picture words always run word/pic-review (already a full loop).
//  - 'phrase/locked' / 'phrase/unlock' are decided by the controller, not here.
import type { ReviewItem } from '../types/reviewItem';
import type { ReviewCardKind } from '../types/cardKind';

function hasChoices(item: ReviewItem): boolean {
  return (item.choices?.length ?? 0) >= 2;
}

/** Even total reps → the MC/recognition step; odd → the speak/production step. */
function speakTurn(item: ReviewItem): boolean {
  return ((item.receptiveReps ?? 0) + (item.productiveReps ?? 0)) % 2 === 1;
}

export function renderFor(item: ReviewItem): ReviewCardKind {
  // New words: first exposure → the learn template chosen by word class.
  if (item.stage === 'new' && item.type === 'word' && !item.retest) {
    if (item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.wordClass === 'function') return 'word/learn-function';
  }

  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    if (item.retest === 'speak') return hasChoices(item) ? 'word/say' : 'word/hear';
    if (item.retest === 'mc') return 'word/hear';
    // Due review: rotate MC ↔ speak. word/say needs choices for its choose stage.
    if (speakTurn(item) && hasChoices(item)) return 'word/say';
    return 'word/hear';
  }

  if (item.type === 'phrase') {
    if (item.retest === 'speak') return 'phrase/sayit';
    if (item.retest === 'mc') return hasChoices(item) ? 'phrase/meaning' : 'phrase/hear';
    if (item.stage === 'new') return 'phrase/hear'; // first exposure
    if (speakTurn(item)) return 'phrase/sayit';
    return hasChoices(item) ? 'phrase/meaning' : 'phrase/hear';
  }

  // Minimal-pair perception drill — a gliding combination (ie) gets the diphthong card.
  const hasAudio = !!item.audio?.envelope;
  if (item.type === 'pair' && hasAudio) return item.glide ? 'diphthong' : 'drill';
  // audio-less pair is never selected (Module B gates pairs on audio); defensive fallback.
  if (item.type === 'pair') return 'word/learn-concrete';

  return 'pron';
}

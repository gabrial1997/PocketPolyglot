// ReviewItem — the data-in shape every Tier-A card receives.
// Exact fields from BACKEND_INTEGRATION.md §3. Do not change field names: the controller maps
// DB rows (lemma/phrase/pair) onto this shape, and cards read it directly.

export interface ReviewChoice {
  value: string;
  gloss?: string;
  correct: boolean;
}

export interface ReviewExample {
  pre: string;
  w: string;
  post: string;
  en: string;
  audioUrl: string;
}

export interface ReviewMnemonic {
  soundsLike: string;
  note: string;
}

export interface ReviewPair {
  a: string;
  b: string;
  correct: 'a' | 'b';
  audioUrl: string; // the stimulus clip (the word actually played in the perception step)
  aAudioUrl?: string; // clip of side `a` (per-option playback)
  bAudioUrl?: string; // clip of side `b`

  // --- visual-sync installment 2 (optional, presentational) ---
  aHint?: string; bHint?: string;
  aKind?: 'glide' | 'flat'; bKind?: 'glide' | 'flat';
  aNote?: string; bNote?: string;
  aEn?: string; bEn?: string;
}

/** Diphthong-drill only: the gliding combination to "feel" (e.g. ie = i→e). */
export interface ReviewGlide {
  combo: string; // e.g. "ie"
  from: string; // e.g. "i"
  to: string; // e.g. "e"
  audioUrl?: string; // isolated-glide clip played by the "meet the glide" step
}

export interface ReviewItem {
  id: string; // stable item id
  type: 'word' | 'phrase' | 'pair'; // 'pair' = minimal-pair drill
  stage: 'new' | 'learning' | 'review' | 'mature';
  reps: number; // successful reviews so far

  target: string; // the Latvian form, e.g. "māja"
  gloss: string; // e.g. "house"
  pron?: string; // e.g. "MAH-ya"
  wordClass?: 'concrete' | 'abstract' | 'function';

  // `envelope`: precomputed RMS amplitude (0..1 per ~30ms frame) for the live soundbar
  // (LiveWaveform). Produced by content-pipeline/tts.mjs alongside the clip; optional.
  audio: { nativeUrl: string; slowUrl?: string; envelope?: number[] };
  media?: { imageUrl?: string; imageUrlDark?: string };

  mnemonic?: ReviewMnemonic; // abstract learn card
  examples?: ReviewExample[]; // function learn card

  // multiple-choice steps — backend supplies distractors so difficulty is controlled
  choices?: ReviewChoice[];

  // minimal-pair drill
  pair?: ReviewPair;

  // diphthong drill — drives the "meet the glide" step + GlideTrack
  glide?: ReviewGlide;

  // phrases only: literal meaning != actual meaning -> gets a comprehension (meaning) check.
  isIdiom?: boolean;

  // phrase items only — the lemma ids that make up the phrase (for the i+1 lock gate).
  componentLemmaIds?: string[];

  // --- visual-sync installment 2 (optional, presentational) ---
  newForm?: string;
  newLemma?: string;
  lockLemma?: string;
  lockRemaining?: number;
  literalNote?: string;

  // Real projected next-review labels for this card's two outcomes (pass = a Good rating, miss = an
  // Again rating), computed from the live FSRS state by the SRS service so result notes show the
  // TRUE interval rather than a fabricated one. Optional + presentational — absent for stub/preview
  // data, in which case cards fall back to a neutral "your next review is scheduled" line.
  reviewPreview?: { pass: string; miss: string };
}

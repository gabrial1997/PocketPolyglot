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
  audioUrl: string;
}

/** Diphthong-drill only: the gliding combination to "feel" (e.g. ie = i→e). */
export interface ReviewGlide {
  combo: string; // e.g. "ie"
  from: string; // e.g. "i"
  to: string; // e.g. "e"
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
}

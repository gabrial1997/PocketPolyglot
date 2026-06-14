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

export interface ReviewItem {
  id: string; // stable item id
  type: 'word' | 'phrase' | 'pair'; // 'pair' = minimal-pair drill
  stage: 'new' | 'learning' | 'review' | 'mature';
  reps: number; // successful reviews so far

  target: string; // the Latvian form, e.g. "māja"
  gloss: string; // e.g. "house"
  pron?: string; // e.g. "MAH-ya"
  wordClass?: 'concrete' | 'abstract' | 'function';

  audio: { nativeUrl: string; slowUrl?: string };
  media?: { imageUrl?: string; imageUrlDark?: string };

  mnemonic?: ReviewMnemonic; // abstract learn card
  examples?: ReviewExample[]; // function learn card

  // multiple-choice steps — backend supplies distractors so difficulty is controlled
  choices?: ReviewChoice[];

  // minimal-pair drill
  pair?: ReviewPair;
}

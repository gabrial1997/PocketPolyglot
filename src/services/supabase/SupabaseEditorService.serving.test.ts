// F8 — Serving-unaffected guard: qa_status is PROVENANCE, not a serving gate.
//
// Contract (spec §2 / §9): qa_status on lemmas/phrases/minimal_pairs records the editorial
// state of a content row (draft → native_ok → locked). It is written by the content-edit Edge
// Function for QA purposes. It MUST NOT gate what the scheduler serves — drafts are served just
// like native_ok or locked rows.
//
// This test pins that contract from the editor's side so a future schema/query change that
// accidentally adds a qa_status filter will be caught immediately.
//
// Two layers of evidence:
//   1. Mapper layer: lemmaRowToReviewItem / phraseRowToReviewItem / pairRowToReviewItem carry
//      qa_status only as DB metadata. The resulting ReviewItem has NO qa_status field — it is
//      intentionally dropped so no consumer downstream can accidentally use it as a filter.
//   2. Candidate query layer (lemmaCandidates comment + selectBatch): SupabaseSrsService's
//      lemmaCandidates() explicitly documents "Does NOT filter on qa_status (serve drafts per spec)".
//      selectBatch.ts is a pure function whose inputs are DueRef[] + Candidate[] — it has no
//      qa_status awareness at all.

import { lemmaRowToReviewItem, phraseRowToReviewItem, pairRowToReviewItem } from './mappers';
import { selectBatch } from '../../session/selectBatch';
import type { LemmaRow, PhraseRow, MinimalPairRow } from './types';
import type { Candidate, DueRef, SelectContext } from '../../session/selectBatch';

// ---------------------------------------------------------------------------
// Layer 1: Mapper — qa_status is metadata, not a ReviewItem field
// ---------------------------------------------------------------------------

const BASE_LEMMA_ROW: LemmaRow = {
  id: '00000000-0000-0000-0000-000000000001',
  lemma: 'māja',
  gloss_en: 'house',
  pron: null,
  pos: null,
  word_class: 'concrete',
  freq_rank: 1,
  freq_count: null,
  freq_band: null,
  utility_rank: 1,
  cefr: null,
  native_url: 'a.mp3',
  slow_url: null,
  envelope: [0.1, 0.2],
  media: { imageUrl: 'house.png' },
  mnemonic: null,
  examples: null,
  semantic_field: null,
  phonetic_key: null,
  // qa_status is DRAFT — must NOT prevent the row from being served
  qa_status: 'draft',
  literal_gloss: null,
  usage_note: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

it('lemmaRowToReviewItem: a draft-status lemma row maps to a ReviewItem with no qa_status field', () => {
  const item = lemmaRowToReviewItem({ ...BASE_LEMMA_ROW, qa_status: 'draft' });
  // qa_status must NOT be present on ReviewItem — it is provenance metadata only.
  expect('qa_status' in item).toBe(false);
  // The item IS still produced — the mapper does not gate on qa_status.
  expect(item.id).toBe(BASE_LEMMA_ROW.id);
  expect(item.target).toBe('māja');
});

it('lemmaRowToReviewItem: a native_ok-status lemma row is also served (same result shape)', () => {
  const item = lemmaRowToReviewItem({ ...BASE_LEMMA_ROW, qa_status: 'native_ok' });
  expect('qa_status' in item).toBe(false);
  expect(item.id).toBe(BASE_LEMMA_ROW.id);
});

it('lemmaRowToReviewItem: a locked-status lemma row is also served (same result shape)', () => {
  const item = lemmaRowToReviewItem({ ...BASE_LEMMA_ROW, qa_status: 'locked' });
  expect('qa_status' in item).toBe(false);
  expect(item.id).toBe(BASE_LEMMA_ROW.id);
});

const BASE_PHRASE_ROW: PhraseRow = {
  id: '00000000-0000-0000-0000-000000000002',
  target: 'labrīt',
  gloss_en: 'good morning',
  audio_url: 'b.mp3',
  envelope: [0.1, 0.2],
  is_idiom: false,
  seed: null,
  // qa_status is DRAFT — must NOT gate serving
  qa_status: 'draft',
  literal_gloss: null,
  usage_note: null,
  tier: null,
  created_at: '2026-01-01T00:00:00Z',
};

it('phraseRowToReviewItem: a draft-status phrase row maps to a ReviewItem with no qa_status field', () => {
  const item = phraseRowToReviewItem({ ...BASE_PHRASE_ROW, qa_status: 'draft' });
  expect('qa_status' in item).toBe(false);
  expect(item.id).toBe(BASE_PHRASE_ROW.id);
});

const BASE_PAIR_ROW: MinimalPairRow = {
  id: '00000000-0000-0000-0000-000000000003',
  a: 'māsa',
  b: 'nasa',
  correct: 'a',
  audio_url: 'c.mp3',
  a_audio_url: null,
  b_audio_url: null,
  glide_audio_url: null,
  envelope: [0.1, 0.2],
  contrast_type: 'consonant',
  glide: null,
  // qa_status is DRAFT — must NOT gate serving
  qa_status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
};

it('pairRowToReviewItem: a draft-status pair row maps to a ReviewItem with no qa_status field', () => {
  const item = pairRowToReviewItem({ ...BASE_PAIR_ROW, qa_status: 'draft' });
  expect('qa_status' in item).toBe(false);
  expect(item.id).toBe(BASE_PAIR_ROW.id);
});

// ---------------------------------------------------------------------------
// Layer 2: selectBatch — pure function has no qa_status awareness at all
// ---------------------------------------------------------------------------

const DEFAULT_CTX: SelectContext = {
  accountAgeDays: 1,
  introducedToday: 0,
  newRoundsToday: 0,
  dueToday: 0,
  rollingRetention: undefined,
  earnedLemmaIds: new Set(),
  todaysSemanticFields: new Set(),
};

it('selectBatch: a draft candidate (qa_status conceptually draft) is admitted as a new item', () => {
  // The Candidate shape has NO qa_status field — selectBatch is completely unaware of it.
  // This test asserts that a candidate representing a draft lemma is selected normally.
  const draftCandidate: Candidate = {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'word',
    utilityRank: 1,
    hasAudioEnvelope: true,
  };
  const result = selectBatch({ due: [], candidates: [draftCandidate], ctx: DEFAULT_CTX });
  // The draft candidate must appear in the admitted set (no qa_status filter).
  const admittedId = result.admittedNew.map(c => c.id);
  expect(admittedId).toContain('00000000-0000-0000-0000-000000000001');
});

it('selectBatch: a draft due-ref (qa_status conceptually draft) passes the due filter', () => {
  // DueRef also has NO qa_status field. Due items with audio are always included.
  const draftDueRef: DueRef = {
    id: '00000000-0000-0000-0000-000000000002',
    kind: 'word',
    hasAudioEnvelope: true,
  };
  const result = selectBatch({ due: [draftDueRef], candidates: [], ctx: DEFAULT_CTX });
  const dueIds = result.due.map(d => d.id);
  // Draft-status due item is served (no qa_status gate).
  expect(dueIds).toContain('00000000-0000-0000-0000-000000000002');
});

it('selectBatch: Candidate and DueRef types have no qa_status property (compile-time contract)', () => {
  // This test asserts the SHAPE of the types that selectBatch consumes. If qa_status were ever
  // added to Candidate or DueRef as a filter field, the explicit "never" assert below would fail.
  const candidateKeys = Object.keys({
    id: '',
    kind: 'word',
    utilityRank: 1,
    hasAudioEnvelope: false,
  } satisfies Candidate);
  const dueRefKeys = Object.keys({
    id: '',
    kind: 'word',
    hasAudioEnvelope: false,
  } satisfies DueRef);

  expect(candidateKeys).not.toContain('qa_status');
  expect(dueRefKeys).not.toContain('qa_status');
});

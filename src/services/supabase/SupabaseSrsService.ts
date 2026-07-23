// Supabase-backed SRS service. All scheduling logic lives in ./mappers (pure, tested);
// this class is the I/O wrapper: it queries review_state + content rows, runs the mappers,
// and persists review_state + review_log.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Rating } from 'ts-fsrs';
import type { SrsService } from '../index';
import type { ReviewItem } from '../../types/reviewItem';
import type { CardResult } from '../../types/cardResult';
import type { RecordingUploader } from './SupabaseRecordingUploader';
import type {
  DbItemType,
  LemmaRow,
  MinimalPairRow,
  PhraseRow,
  ReviewLogRow,
  ReviewStateRow,
} from './types';
import {
  buildComponentBreakdown,
  cardResultToRating,
  itemTypeToDbType,
  lemmaRowToReviewItem,
  nextReviewLabel,
  pairRowToReviewItem,
  phraseRowToReviewItem,
  projectReviewLabels,
  rowToPrior,
  schedule,
} from './mappers';
import { cardKindToTemplate, isTeachCard, repKind, type ReviewTemplate } from './cardTemplate';
import {
  DAY_ONE_NEW_CAP,
  RETENTION_MINIMUM_SAMPLE,
  RETENTION_WINDOW,
} from '../../session/pacing';
import { computeRung, translationVisibilityForRung } from '../../session/ladder';
import {
  selectBatch,
} from '../../session/selectBatch';
import type {
  Candidate,
  DueRef,
  SelectContext,
} from '../../session/selectBatch';

/**
 * Derive the review_state.item_type from a CardKind string (e.g. 'word/say' -> 'lemma').
 *
 * Exported (pure, no I/O) so the full CardKind -> DbItemType mapping can be unit-tested
 * without a network round-trip. NB: the 'diphthong' drill kind MUST map to 'pair' — it is
 * backed by a minimal_pairs row, same as 'drill'/'pron'. Forgetting it here routes the
 * diphthong drill's review_state to the 'lemma' fallback (wrong item_type), corrupting
 * scheduling. See cardKindToDbType.test.ts, which iterates the card registry to force every
 * registered CardKind to be covered.
 */
export function cardKindToDbType(cardKind: string): DbItemType {
  if (cardKind.startsWith('word')) return 'lemma';
  if (cardKind.startsWith('phrase')) return 'phrase';
  if (
    cardKind.startsWith('drill') ||
    cardKind.startsWith('diphthong') ||
    cardKind.startsWith('pron')
  ) {
    return 'pair';
  }
  // Fallback: treat unknown kinds as lemma so the row still schedules.
  return 'lemma';
}

// Free-practice fallback size: when nothing is due, a session serves up to this many already-known
// items so it is never empty. This bounds a single session's LENGTH, not how many sessions you may
// start — sessions stay unlimited (no cap).
const PRACTICE_BATCH = 20;

// One day, in ms — how far out a freshly-seeded drill's due_at is deferred (see
// ensureDrillsSeeded): drills join from the next session, not the first-exposure day.
const DRILL_SEED_DEFER_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Private pure helpers
// ---------------------------------------------------------------------------

/** In-place Fisher–Yates shuffle (so the correct MC option isn't always first). */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Start of the local calendar day containing `now` (midnight local time) as a Date.
 * Injectable clock: pass `now` explicitly for testability (no Date.now() reads inside).
 */
function startOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------

export class SupabaseSrsService implements SrsService {
  // Injectable clock: the nowFn constructor param (tests / dev time travel) or real time.
  private now(): Date {
    return this.nowFn ? this.nowFn() : new Date();
  }

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly uploader?: RecordingUploader,
    private readonly nowFn?: () => Date,
  ) {}

  // -------------------------------------------------------------------------
  // Private helpers — one DB query each; all injectable through `this.client`.
  // -------------------------------------------------------------------------

  /** Count introduction events today (word/learn-* card_kind). */
  private async introducedToday(now: Date): Promise<number> {
    const dayStart = startOfLocalDay(now).toISOString();
    const { data, error } = await this.client
      .from('review_log')
      .select('item_id')
      .eq('user_id', this.userId)
      // Words only: newAllowance budgets WORDS (phrases ride under PHRASE_INTRO_CAP in
      // selectBatch), so phrase exposures must not shrink the word allowance.
      .like('card_kind', 'word/learn-%')
      .gte('created_at', dayStart)
      .lte('created_at', now.toISOString());
    // Throw, don't swallow: a failed query here would look like "0 introduced today" and
    // reset the daily new-word cap. The session shows its load-failure state instead.
    if (error) throw error;
    if (!data) return 0;
    return new Set((data as Array<{ item_id?: string }>).map(r => r.item_id)).size;
  }

  /** Days since the account was created. Falls back to earliest review_log.created_at. */
  private async accountAgeDays(now: Date): Promise<number> {
    // Try profiles.created_at first. profiles PK is `id` (not `user_id`).
    const { data: profile, error: profileErr } = await this.client
      .from('profiles')
      .select('created_at')
      .eq('id', this.userId)
      .maybeSingle();
    if (profileErr) {
      console.warn('[SupabaseSrsService] accountAgeDays: profiles query failed, falling back to review_log', profileErr);
    }
    let created: Date | null = null;
    if (profile && (profile as { created_at?: string }).created_at) {
      created = new Date((profile as { created_at: string }).created_at);
    }
    if (!created) {
      // Fall back to earliest review_log.created_at (Module D guarantees profiles later).
      const { data: earliest } = await this.client
        .from('review_log')
        .select('created_at')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: true })
        .limit(1);
      const row = (earliest as Array<{ created_at?: string }> | null)?.[0];
      if (row?.created_at) created = new Date(row.created_at);
    }
    if (!created) return 0; // brand-new account with no history
    return Math.floor((now.getTime() - created.getTime()) / 86_400_000);
  }

  /**
   * Correct-rate over the last RETENTION_WINDOW graded mature reviews.
   * Returns undefined when there are fewer than a minimum of graded mature rows (no throttle).
   */
  private async rollingRetention(): Promise<number | undefined> {
    // Fetch the last RETENTION_WINDOW review_log rows that are graded (correct IS NOT NULL)
    // on items at stage='mature'. We join review_log with review_state to check stage.
    // Simplified: fetch last RETENTION_WINDOW rows with correct IS NOT NULL from review_log.
    // (A full server-side join is a migration concern; this approximation is spec-compliant
    // and avoids an RPC requirement for a helper query.)
    const { data, error } = await this.client
      .from('review_log')
      .select('correct')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(RETENTION_WINDOW);
    if (error) throw error;
    if (!data) return undefined;
    const rows = data as Array<{ correct?: boolean | null }>;
    const graded = rows.filter(r => r.correct !== null && r.correct !== undefined);
    if (graded.length < RETENTION_MINIMUM_SAMPLE) return undefined;
    const correct = graded.filter(r => r.correct === true).length;
    return correct / graded.length;
  }

  /** lemma ids with ≥1 review_log row correct=true (used for the i+1 anchor check). */
  private async recalledLemmaIds(): Promise<Set<string>> {
    // review_log grows forever, and an un-ranged select silently truncates at PostgREST's
    // default 1000-row cap — after ~1000 correct reviews, later-recalled anchors would vanish
    // and their phrases could never unlock. Page through the full set (ordered by the uuid PK
    // for a stable page walk, same pattern as lemmaCandidates).
    const CHUNK = 1000;
    const ids = new Set<string>();
    let offset = 0;
    for (;;) {
      const { data, error } = await this.client
        .from('review_log')
        .select('item_id')
        .eq('user_id', this.userId)
        .eq('item_type', 'lemma')
        .eq('correct', true)
        .order('id', { ascending: true })
        .range(offset, offset + CHUNK - 1);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ item_id?: string }>;
      for (const r of rows) if (r.item_id) ids.add(r.item_id);
      if (rows.length < CHUNK) return ids;
      offset += CHUNK;
    }
  }

  /** lemma ids the user "knows" (known_lemmas view, security_invoker=true verified). */
  private async knownLemmaIds(): Promise<Set<string>> {
    const { data, error } = await this.client
      .from('known_lemmas')
      .select('lemma_id')
      .eq('user_id', this.userId);
    if (error) throw error;
    if (!data) return new Set();
    return new Set((data as Array<{ lemma_id?: string }>).map(r => r.lemma_id).filter(Boolean) as string[]);
  }

  /**
   * Load never-introduced lemma candidates in utility_rank order.
   * Pages through lemmas in chunks of 200, skipping ids that already have a review_state row,
   * until we have at least DAY_ONE_NEW_CAP * 4 never-introduced rows or the table is exhausted.
   * Does NOT filter on qa_status (serve drafts per spec).
   */
  private async lemmaCandidates(): Promise<{ rows: LemmaRow[]; candidates: Candidate[] }> {
    // Load the set of already-introduced lemma ids.
    const { data: stateData, error: stateErr } = await this.client
      .from('review_state')
      .select('item_id')
      .eq('user_id', this.userId)
      .eq('item_type', 'lemma');
    // Throw, don't swallow: a failed query would look like "nothing introduced yet" and
    // re-admit already-introduced lemmas as new.
    if (stateErr) throw stateErr;
    const introducedIds = new Set(
      ((stateData ?? []) as Array<{ item_id?: string }>).map(r => r.item_id).filter(Boolean) as string[]
    );

    // Page through lemmas in utility_rank order, skipping already-introduced, until we have enough.
    const TARGET = DAY_ONE_NEW_CAP * 4;
    const CHUNK = 200;
    const collectedRows: LemmaRow[] = [];
    let offset = 0;
    let exhausted = false;

    while (collectedRows.length < TARGET && !exhausted) {
      const { data: chunk, error: chunkErr } = await this.client
        .from('lemmas')
        .select('*')
        .order('utility_rank', { ascending: true, nullsFirst: false })
        // Secondary sort on the PK: utility_rank ties (and the all-NULL tail) would otherwise
        // be unstable across .range() pages — duplicating/skipping rows between chunks.
        // Same tiebreaker discipline as phraseCandidates.
        .order('id', { ascending: true })
        .range(offset, offset + CHUNK - 1);
      if (chunkErr) throw chunkErr;
      if (!chunk || (chunk as LemmaRow[]).length === 0) { exhausted = true; break; }
      for (const row of chunk as LemmaRow[]) {
        if (!introducedIds.has(row.id)) collectedRows.push(row);
      }
      if ((chunk as LemmaRow[]).length < CHUNK) exhausted = true;
      offset += CHUNK;
    }

    const candidates: Candidate[] = collectedRows.map(r => ({
      id: r.id,
      kind: 'word' as const,
      utilityRank: r.utility_rank ?? 9999,
      hasAudioEnvelope: !!(r.envelope && r.envelope.length > 0),
      semanticField: r.semantic_field ?? null,
    }));
    return { rows: collectedRows, candidates };
  }

  /**
   * Load never-introduced phrase candidates ordered by created_at ASC, id ASC.
   * Pages through phrases in chunks of 200, skipping ids that already have a review_state row,
   * until we have at least DAY_ONE_NEW_CAP * 4 never-introduced rows or the table is exhausted.
   */
  private async phraseCandidates(): Promise<{ rows: PhraseRow[]; candidates: Candidate[] }> {
    // Load the set of already-introduced phrase ids.
    const { data: stateData, error: stateErr } = await this.client
      .from('review_state')
      .select('item_id')
      .eq('user_id', this.userId)
      .eq('item_type', 'phrase');
    if (stateErr) throw stateErr;
    const introducedIds = new Set(
      ((stateData ?? []) as Array<{ item_id?: string }>).map(r => r.item_id).filter(Boolean) as string[]
    );

    // Page through phrases in tier → created_at → id order, skipping already-introduced, until we
    // have enough. Tier (1 = highest utility, from phrases.csv; migration 0019) leads so T1
    // everyday phrases surface before T2/T3 — insertion order alone let a mid-utility phrase be
    // among the first met (beta report 44a3116c). Tierless rows sort last, keeping their old order.
    const TARGET = DAY_ONE_NEW_CAP * 4;
    const CHUNK = 200;
    const collectedRows: PhraseRow[] = [];
    let offset = 0;
    let exhausted = false;

    while (collectedRows.length < TARGET && !exhausted) {
      const { data: chunk, error: chunkErr } = await this.client
        .from('phrases')
        .select('*')
        .order('tier', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + CHUNK - 1);
      if (chunkErr) throw chunkErr;
      if (!chunk || (chunk as PhraseRow[]).length === 0) { exhausted = true; break; }
      for (const row of chunk as PhraseRow[]) {
        if (!introducedIds.has(row.id)) collectedRows.push(row);
      }
      if ((chunk as PhraseRow[]).length < CHUNK) exhausted = true;
      offset += CHUNK;
    }

    // Load phrase_components for all candidate phrases in one query.
    const phraseIds = collectedRows.map(r => r.id);
    let componentsByPhrase: Map<string, string[]> = new Map();
    if (phraseIds.length > 0) {
      const { data: comps, error: compsErr } = await this.client
        .from('phrase_components')
        .select('phrase_id,lemma_id,position')
        .in('phrase_id', phraseIds)
        // Position order is load-bearing: compIds[0] below becomes anchorLemmaId (the phrase's
        // FIRST component), which gates i+1 admission. Unordered rows would pick a random word.
        .order('position', { ascending: true });
      if (compsErr) throw compsErr;
      if (comps) {
        const compRows = comps as Array<{ phrase_id: string; lemma_id: string; position?: number }>;
        componentsByPhrase = compRows.reduce((m, c) => {
          const arr = m.get(c.phrase_id) ?? [];
          arr.push(c.lemma_id);
          m.set(c.phrase_id, arr);
          return m;
        }, new Map<string, string[]>());
      }
    }

    const candidates: Candidate[] = collectedRows.map((r, idx) => {
      const compIds = componentsByPhrase.get(r.id) ?? [];
      return {
        id: r.id,
        kind: 'phrase' as const,
        // Phrases have no utility_rank; use insertion order as a proxy
        utilityRank: idx + 1,
        hasAudioEnvelope: !!(r.envelope && r.envelope.length > 0),
        componentLemmaIds: compIds,
        // anchorLemmaId: first component (position=0 or first in list)
        anchorLemmaId: compIds[0] ?? undefined,
      };
    });
    return { rows: collectedRows, candidates };
  }

  /**
   * Seed perception-drill (minimal-pair) review_state rows so drills can enter the loop.
   *
   * Drills are the one item kind with no candidate path: lemmas/phrases are admitted as NEW from
   * the content tables, but a pair surfaces ONLY when a review_state row makes it due — and nothing
   * else creates one for a real user, so without this a learner would never see the L/Ļ or `ie`
   * drills. We seed every QA'd, audio-bearing drill as a due first-exposure (stage='new' so it
   * still renders as a drill/diphthong card; due_at in the past so the due query picks it up now).
   *
   * Content-driven (not hard-coded ids) and self-healing: gated on the user having ZERO
   * recognition-template pair rows, so it runs once per user, backfills existing accounts on
   * their next batch, and never clobbers a drill already in progress. (A drill added AFTER a
   * user is seeded won't reach them until we widen this; acceptable while the curated drill set
   * is tiny — see core-loop review notes.) The gate is scoped to template='recognition' — pairs
   * can also carry a 'pronunciation'-template row (from a graded 'pron' card, per cardTemplate.ts),
   * and counting those would falsely report drills as already seeded for a user who has never
   * received one, permanently starving them of the L/Ļ / `ie` drills.
   */
  private async ensureDrillsSeeded(now: Date): Promise<void> {
    const { count, error: countErr } = await this.client
      .from('review_state')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .eq('item_type', 'pair')
      .eq('template', 'recognition');
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) return; // already has drill rows — done.

    const { data: drillData, error: drillErr } = await this.client
      .from('minimal_pairs')
      .select('*')
      .eq('qa_status', 'native_ok');
    if (drillErr) throw drillErr;
    const drills = ((drillData ?? []) as MinimalPairRow[]).filter((d) => d.audio_url != null);
    if (drills.length === 0) return;

    // due_at 1 day out: a fresh (or freshly reset) account's day 0 is the teach→MC→speak
    // word arc — perception drills join from the next session, not ahead of the first words.
    const dueIso = new Date(now.getTime() + DRILL_SEED_DEFER_MS).toISOString();
    const rows = drills.map((d) => ({
      user_id: this.userId,
      item_type: 'pair' as const,
      item_id: d.id,
      template: 'recognition' as const,
      stage: 'new' as const,
      reps: 0,
      lapses: 0,
      due_at: dueIso,
    }));
    const { error: upErr } = await this.client
      .from('review_state')
      .upsert(rows, { onConflict: 'user_id,item_type,item_id,template', ignoreDuplicates: true });
    if (upErr) throw upErr;
  }

  // -------------------------------------------------------------------------
  // Main public method — rewritten for B2.
  // -------------------------------------------------------------------------

  async getDueBatch(): Promise<ReviewItem[]> {
    const now = this.now();
    const nowIso = now.toISOString();

    // ------------------------------------------------------------------
    // 0. Make sure perception drills can enter the loop. Unlike lemmas/phrases, minimal-pair
    //    drills have NO candidate path — they surface ONLY via a review_state row, and nothing else
    //    creates one for a real user. So seed them here (idempotent; backfills existing users).
    // ------------------------------------------------------------------
    await this.ensureDrillsSeeded(now);

    // ------------------------------------------------------------------
    // 1. Fetch due items: review_state WHERE due_at <= now (drop stage='new' clause).
    //    Due items are UNCAPPED — selectBatch returns them all.
    // ------------------------------------------------------------------
    // Plan A: render only the recognition schedule. Pronunciation rows are written by submit() but
    // not surfaced until Plan B/2 makes rendering template-aware. Keeps the loop behaviour identical.
    // The filter lives in the query (template is NOT NULL DEFAULT 'recognition' since 0014, so
    // every row carries it) — fetching all templates and discarding in JS would waste rows out of
    // the response and, worse, count against any row cap before the JS filter ran.
    const { data: dueStateData, error: dueErr } = await this.client
      .from('review_state')
      .select('*')
      .eq('user_id', this.userId)
      .eq('template', 'recognition')
      .lte('due_at', nowIso)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('item_id', { ascending: true });
    if (dueErr) throw dueErr;

    const dueStates: ReviewStateRow[] = (dueStateData ?? []) as ReviewStateRow[];

    const stateByKey = new Map<string, ReviewStateRow>();
    for (const s of dueStates) { stateByKey.set(`${s.item_type}:${s.item_id}`, s); }
    const allDueRows = dueStates;

    // ------------------------------------------------------------------
    // 2. Build the SelectContext: gather counts + sets in parallel.
    // ------------------------------------------------------------------
    const [
      intrToday,
      acctAgeDays,
      rolling,
      recalled,
      known,
    ] = await Promise.all([
      this.introducedToday(now),
      this.accountAgeDays(now),
      this.rollingRetention(),
      this.recalledLemmaIds(),
      this.knownLemmaIds(),
    ]);

    // ------------------------------------------------------------------
    // 3. Load candidates: content rows without a review_state row.
    //    lemmaCandidates() and phraseCandidates() internally skip already-introduced ids.
    // ------------------------------------------------------------------
    const [{ rows: lemmaRows, candidates: lemmaCandidates }, { rows: phraseRows, candidates: phraseCandidates }] =
      await Promise.all([this.lemmaCandidates(), this.phraseCandidates()]);

    const allCandidates: Candidate[] = [...lemmaCandidates, ...phraseCandidates];

    // ------------------------------------------------------------------
    // 4. Build DueRef[] from allDueRows (map to the light shape selectBatch needs).
    //    We need content metadata (hasAudioEnvelope) for each due item; the same content
    //    rows are re-used below as the enrichAndReorder prefetch (no double fetch).
    // ------------------------------------------------------------------

    // Only lemma/phrase/pair rows can reach here: the due query is scoped to the recognition
    // template and no code path writes any other item_type ('wordform' scheduling is post-MVP).
    const dueByType: Record<Exclude<DbItemType, 'wordform'>, string[]> = {
      lemma: [],
      phrase: [],
      pair: [],
    };
    for (const s of allDueRows) {
      if (s.item_type !== 'wordform') dueByType[s.item_type].push(s.item_id);
    }

    // Fetch lemma content for due items.
    const dueLemmaMap = new Map<string, LemmaRow>();
    if (dueByType.lemma.length > 0) {
      const { data: dl, error: dlErr } = await this.client.from('lemmas').select('*').in('id', dueByType.lemma);
      if (dlErr) throw dlErr;
      for (const r of (dl ?? []) as LemmaRow[]) dueLemmaMap.set(r.id, r);
    }
    const duePhraseMap = new Map<string, PhraseRow>();
    if (dueByType.phrase.length > 0) {
      const { data: dp, error: dpErr } = await this.client.from('phrases').select('*').in('id', dueByType.phrase);
      if (dpErr) throw dpErr;
      for (const r of (dp ?? []) as PhraseRow[]) duePhraseMap.set(r.id, r);
    }
    const duePairMap = new Map<string, MinimalPairRow>();
    if (dueByType.pair.length > 0) {
      const { data: dpa, error: dpaErr } = await this.client.from('minimal_pairs').select('*').in('id', dueByType.pair);
      if (dpaErr) throw dpaErr;
      for (const r of (dpa ?? []) as MinimalPairRow[]) duePairMap.set(r.id, r);
    }

    // Build DueRef[] preserving allDueRows order.
    const dueRefs: DueRef[] = [];
    for (const s of allDueRows) {
      let hasAudioEnvelope = false;
      if (s.item_type === 'lemma') {
        const r = dueLemmaMap.get(s.item_id);
        if (r) hasAudioEnvelope = !!(r.envelope && r.envelope.length > 0);
      } else if (s.item_type === 'phrase') {
        const r = duePhraseMap.get(s.item_id);
        if (r) hasAudioEnvelope = !!(r.envelope && r.envelope.length > 0);
      } else if (s.item_type === 'pair') {
        const r = duePairMap.get(s.item_id);
        if (r) hasAudioEnvelope = !!(r.envelope && r.envelope.length > 0);
      }
      dueRefs.push({
        id: s.item_id,
        kind: s.item_type === 'lemma' ? 'word' : s.item_type === 'phrase' ? 'phrase' : 'pair',
        hasAudioEnvelope,
      });
    }

    // ------------------------------------------------------------------
    // 5. Build SelectContext and call selectBatch (pure).
    // ------------------------------------------------------------------
    const ctx: SelectContext = {
      accountAgeDays: acctAgeDays,
      introducedToday: intrToday,
      dueToday: dueRefs.length,
      rollingRetention: rolling,
      knownLemmaIds: known,
      recalledLemmaIds: recalled,
      // Per-batch only (session-scoped): always starts empty, so semantic-field diversity is
      // enforced within this one batch, not across sessions/days. Nothing persists admitted
      // fields between calls. (Matches the SelectContext doc in selectBatch.ts.)
      todaysSemanticFields: new Set<string>(),
    };

    const result = selectBatch({ due: dueRefs, candidates: allCandidates, ctx });

    // ------------------------------------------------------------------
    // 6. If selectBatch admits nothing AND nothing was due → fall back to
    //    free-practice (review-only, no new).
    // ------------------------------------------------------------------
    if (result.order.length === 0) {
      const { data: practice, error: practiceErr } = await this.client
        .from('review_state')
        .select('*')
        .eq('user_id', this.userId)
        .eq('template', 'recognition')
        // A never-seen item (stage='new') is not "practice" — exclude freshly-seeded, future-dated
        // drills (see ensureDrillsSeeded) so they don't leak into a same-day reopen with nothing due.
        .neq('stage', 'new')
        .order('due_at', { ascending: true })
        .limit(PRACTICE_BATCH);
      if (practiceErr) throw practiceErr;
      const practiceRows: ReviewStateRow[] = (practice ?? []) as ReviewStateRow[];
      if (practiceRows.length === 0) return [];
      // Build a minimal batch from practice rows (review-only, no new candidates).
      // We reuse the existing enrichment path below by re-routing through `rows`.
      return this.enrichAndReorder(practiceRows, now);
    }

    // ------------------------------------------------------------------
    // 7. Use result.order to pick and sequence the content rows.
    //    Build a ReviewStateRow[] ordered per result.order, then enrich.
    // ------------------------------------------------------------------

    // Map from id -> ReviewStateRow (for admitted new items, there is no state row).
    // For new items, we create a synthetic review state.
    const orderedStates: ReviewStateRow[] = [];
    for (const entry of result.order) {
      const dbType: DbItemType = entry.kind === 'word' ? 'lemma' : entry.kind === 'phrase' ? 'phrase' : 'pair';
      const existing = stateByKey.get(`${dbType}:${entry.id}`);
      if (existing) {
        orderedStates.push(existing);
      } else {
        // New item — synthetic state row (no DB row yet). Every ReviewStateRow field is
        // supplied, so this is typed directly (no cast).
        const synthetic: ReviewStateRow = {
          user_id: this.userId,
          item_type: dbType,
          item_id: entry.id,
          template: 'recognition',
          stage: 'new',
          reps: 0,
          lapses: 0,
          stability: null,
          difficulty: null,
          due_at: null,
          last_review: null,
        };
        orderedStates.push(synthetic);
      }
    }

    return this.enrichAndReorder(orderedStates, now, {
      dueLemmaMap,
      duePhraseMap,
      duePairMap,
      candidateLemmaRows: lemmaRows,
      candidatePhraseRows: phraseRows,
    });
  }

  /**
   * Given an ordered list of ReviewStateRow (due + new), fetch any missing content rows,
   * enrich with distractors + phrase_components + reviewPreview, and return ReviewItem[].
   * Content maps from step 4 are passed in to avoid re-fetching due items.
   */
  private async enrichAndReorder(
    orderedStates: ReviewStateRow[],
    now: Date,
    prefetched?: {
      dueLemmaMap: Map<string, LemmaRow>;
      duePhraseMap: Map<string, PhraseRow>;
      duePairMap: Map<string, MinimalPairRow>;
      candidateLemmaRows: LemmaRow[];
      candidatePhraseRows: PhraseRow[];
    },
  ): Promise<ReviewItem[]> {
    // Build content maps: merge prefetched + fetch any missing ids.
    const lemmaMap = new Map<string, LemmaRow>(prefetched?.dueLemmaMap ?? []);
    const phraseMap = new Map<string, PhraseRow>(prefetched?.duePhraseMap ?? []);
    const pairMap = new Map<string, MinimalPairRow>(prefetched?.duePairMap ?? []);

    // Add candidate rows (new items) to the maps.
    for (const r of prefetched?.candidateLemmaRows ?? []) lemmaMap.set(r.id, r);
    for (const r of prefetched?.candidatePhraseRows ?? []) phraseMap.set(r.id, r);

    // Find any still-missing ids and fetch them.
    const missingLemmaIds = orderedStates.filter(s => s.item_type === 'lemma' && !lemmaMap.has(s.item_id)).map(s => s.item_id);
    const missingPhraseIds = orderedStates.filter(s => s.item_type === 'phrase' && !phraseMap.has(s.item_id)).map(s => s.item_id);
    const missingPairIds = orderedStates.filter(s => s.item_type === 'pair' && !pairMap.has(s.item_id)).map(s => s.item_id);

    if (missingLemmaIds.length > 0) {
      const { data, error } = await this.client.from('lemmas').select('*').in('id', missingLemmaIds);
      if (error) throw error;
      for (const r of (data ?? []) as LemmaRow[]) lemmaMap.set(r.id, r);
    }
    if (missingPhraseIds.length > 0) {
      const { data, error } = await this.client.from('phrases').select('*').in('id', missingPhraseIds);
      if (error) throw error;
      for (const r of (data ?? []) as PhraseRow[]) phraseMap.set(r.id, r);
    }
    if (missingPairIds.length > 0) {
      const { data, error } = await this.client.from('minimal_pairs').select('*').in('id', missingPairIds);
      if (error) throw error;
      for (const r of (data ?? []) as MinimalPairRow[]) pairMap.set(r.id, r);
    }

    // Build items in orderedStates sequence.
    const items: ReviewItem[] = [];
    const stateByKey = new Map<string, ReviewStateRow>();
    for (const s of orderedStates) stateByKey.set(`${s.item_type}:${s.item_id}`, s);

    // Phrase items + their component rows, collected during the loop; the per-word intro
    // breakdown is built after it (one batched lemmas query for whatever lemmaMap lacks).
    const phraseComponents: Array<{
      item: ReviewItem;
      comps: Array<{ lemma_id: string; position: number }>;
    }> = [];

    for (const s of orderedStates) {
      if (s.item_type === 'lemma') {
        const row = lemmaMap.get(s.item_id);
        if (!row) continue;
        const item = lemmaRowToReviewItem(row, stateByKey.get(`lemma:${row.id}`));
        // Distractors — graceful fallback on RPC failure. NB: supabase-js rpc() never throws;
        // it resolves { data, error }, so the failure signal is the `error` FIELD (a try/catch
        // here would be dead code). On error, or when the RPC yields zero decoys (a one-option
        // MC card would answer itself), leave choices undefined — the documented degrade path
        // (cards require ≥2 choices; see renderFor.ts / WordHear).
        const { data: distractors, error: distractorErr } = await this.client.rpc('get_distractors', {
          target: row.id,
          n: 3,
        });
        const decoys = distractorErr ? [] : ((distractors ?? []) as LemmaRow[]);
        if (decoys.length > 0) {
          const choices = [
            { value: item.target, gloss: item.gloss, correct: true },
            ...decoys.map((d) => ({
              value: d.lemma,
              gloss: d.gloss_en,
              correct: false,
            })),
          ];
          // Shuffle so the correct answer isn't always the first option. Done once per fetch;
          // the card renders this fixed order (positions stay stable across wrong-pick re-renders).
          item.choices = shuffleInPlace(choices);
        }
        items.push(item);
      } else if (s.item_type === 'phrase') {
        const row = phraseMap.get(s.item_id);
        if (!row) continue;
        const item = phraseRowToReviewItem(row, stateByKey.get(`phrase:${row.id}`));
        const { data: components, error: componentsErr } = await this.client
          .from('phrase_components')
          .select('lemma_id,position')
          .eq('phrase_id', row.id)
          // Position order is load-bearing: componentLemmaIds must follow the phrase's word
          // order, and the `c.position ?? i` fallback below indexes the returned row order.
          .order('position', { ascending: true });
        if (componentsErr) throw componentsErr;
        if (components) {
          const comps = components as { lemma_id: string; position?: number }[];
          item.componentLemmaIds = comps.map((c) => c.lemma_id);
          // Collected for the post-loop breakdown build (needs lemma text/gloss — batched below).
          phraseComponents.push({
            item,
            comps: comps.map((c, i) => ({ lemma_id: c.lemma_id, position: c.position ?? i })),
          });
        }
        // Meaning-quiz distractors — same error-field + zero-decoy degrade rule as the lemma
        // branch above (rpc() never throws; a one-option quiz would answer itself).
        const { data: pdist, error: pdistErr } = await this.client.rpc('get_phrase_distractors', {
          target_id: row.id,
          n: 3,
        });
        const pdecoys = pdistErr ? [] : ((pdist ?? []) as Array<{ id: string; gloss_en: string }>);
        if (pdecoys.length > 0) {
          const choices = [
            { value: item.id, gloss: item.gloss, correct: true },
            ...pdecoys.map((d) => ({
              value: d.id,
              gloss: d.gloss_en,
              correct: false,
            })),
          ];
          item.choices = shuffleInPlace(choices);
        }
        items.push(item);
      } else if (s.item_type === 'pair') {
        const row = pairMap.get(s.item_id);
        if (!row) continue;
        items.push(pairRowToReviewItem(row, stateByKey.get(`pair:${row.id}`)));
      }
    }

    // Build the per-word intro breakdown for phrases: resolve component lemma text/gloss
    // (one query for whatever the due/candidate lemma maps don't already hold) and align
    // tokens by position via buildComponentBreakdown (pure, tested).
    if (phraseComponents.length > 0) {
      const missing = new Set<string>();
      for (const { comps } of phraseComponents) {
        for (const c of comps) if (!lemmaMap.has(c.lemma_id)) missing.add(c.lemma_id);
      }
      if (missing.size > 0) {
        const { data, error } = await this.client.from('lemmas').select('*').in('id', [...missing]);
        if (error) throw error;
        for (const r of (data ?? []) as LemmaRow[]) lemmaMap.set(r.id, r);
      }
      for (const { item, comps } of phraseComponents) {
        item.componentBreakdown = buildComponentBreakdown(
          item.target,
          comps.flatMap((c) => {
            const l = lemmaMap.get(c.lemma_id);
            return l ? [{ position: c.position, lemma: l.lemma, gloss: l.gloss_en }] : [];
          }),
        );
      }
    }

    // Attach projected next-review labels.
    for (const item of items) {
      const state = stateByKey.get(`${itemTypeToDbType(item.type)}:${item.id}`);
      item.reviewPreview = projectReviewLabels(rowToPrior(state), now);
    }

    // ------------------------------------------------------------------
    // C2: Derive receptiveReps / productiveReps / translationVisibility
    // from a single batched review_log query for this user + assembled ids.
    // ------------------------------------------------------------------
    if (items.length > 0) {
      const assembledIds = items.map(i => i.id);
      // A batch item's review_log rows grow forever; an un-ranged select silently truncates at
      // PostgREST's default 1000-row cap, zeroing/undercounting rep counts for long-lived
      // accounts. Page through (uuid PK order for a stable walk), same as recalledLemmaIds.
      const CHUNK = 1000;
      const logRows: ReviewLogRow[] = [];
      let offset = 0;
      for (;;) {
        const { data: logData, error: logErr } = await this.client
          .from('review_log')
          .select('item_type,item_id,card_kind,correct')
          .eq('user_id', this.userId)
          .in('item_id', assembledIds)
          .order('id', { ascending: true })
          .range(offset, offset + CHUNK - 1);
        if (logErr) throw logErr;
        const page = (logData ?? []) as ReviewLogRow[];
        logRows.push(...page);
        if (page.length < CHUNK) break;
        offset += CHUNK;
      }

      // Group counts per (item_type, item_id).
      const repsByKey = new Map<string, { receptive: number; productive: number }>();
      for (const row of logRows) {
        const kind = repKind(row.card_kind, row.correct);
        if (kind === null) continue;
        const key = `${row.item_type}:${row.item_id}`;
        const counts = repsByKey.get(key) ?? { receptive: 0, productive: 0 };
        counts[kind] += 1;
        repsByKey.set(key, counts);
      }

      // Apply to each item.
      for (const item of items) {
        const dbType = itemTypeToDbType(item.type);
        const key = `${dbType}:${item.id}`;
        const counts = repsByKey.get(key) ?? { receptive: 0, productive: 0 };
        item.receptiveReps = counts.receptive;
        item.productiveReps = counts.productive;
        item.translationVisibility = translationVisibilityForRung(
          computeRung(item.receptiveReps, item.productiveReps),
        );
      }
    }

    return items;
  }

  /**
   * Read the prior schedule for one (item, template) row, advance it via FSRS, and upsert the
   * result. Split out of submit() because a production-card grade must schedule TWO rows (see
   * submit()'s comment on the recognition companion write).
   */
  private async scheduleTemplateRow(
    itemType: DbItemType,
    itemId: string,
    template: ReviewTemplate,
    rating: Rating.Again | Rating.Good,
    now: Date,
  ): Promise<{ label: string }> {
    const { data: prevRow, error: prevErr } = await this.client
      .from('review_state')
      .select('*')
      .eq('user_id', this.userId)
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .eq('template', template)
      .maybeSingle();
    if (prevErr) throw prevErr;

    const prior = rowToPrior(prevRow as ReviewStateRow | null);
    const next = schedule(prior, rating, now);
    const label = nextReviewLabel(next.due, now);

    const { error: upsertErr } = await this.client.from('review_state').upsert(
      {
        user_id: this.userId,
        item_type: itemType,
        item_id: itemId,
        template,
        stage: next.stage,
        reps: next.reps,
        lapses: next.lapses,
        stability: next.stability,
        difficulty: next.difficulty,
        due_at: next.due.toISOString(),
        last_review: next.last_review.toISOString(),
      },
      { onConflict: 'user_id,item_type,item_id,template' },
    );
    if (upsertErr) throw upsertErr;

    return { label };
  }

  async submit(result: CardResult): Promise<{ nextReviewLabel: string; rung: import('../../session/ladder').Rung }> {
    const now = this.now();
    const itemType = cardKindToDbType(result.cardKind);
    const template = cardKindToTemplate(result.cardKind);
    const rating = cardResultToRating(result);

    // Teach cards are ungraded exposures — no retrieval happened, so FSRS must not hear a Good
    // (TEACH_CARD_KINDS doc). The exposure is still review_log'd below; the item's schedule stays
    // whatever admission seeded, and its first real grade is the arc's MC step later this session.
    const teach = isTeachCard(result.cardKind);
    const { label } = teach
      ? { label: 'Next review later today' }
      : await this.scheduleTemplateRow(itemType, result.itemId, template, rating, now);

    // getDueBatch() renders (and known_lemmas gates) off the recognition template ONLY. Under the
    // MC↔speak rotation, renderFor() can serve a 'speak' turn for a card whose only grade this
    // round is a pronunciation-template rating — the recognition row itself never gets a grade of
    // its own that turn. Without this companion write, the recognition row's due_at would freeze,
    // lapse into the past, and the item would be re-admitted as "due" every session forever even
    // though the learner keeps passing it via speak. Advance recognition's own schedule
    // (independent stability/difficulty) alongside it so due-ness keeps tracking real review
    // activity regardless of which turn (MC or speak) actually fired this round.
    if (!teach && template !== 'recognition') {
      await this.scheduleTemplateRow(itemType, result.itemId, 'recognition', rating, now);
    }

    // E2: upload the recording (if present + consent given) BEFORE writing review_log.
    // Returns null on any failure so the session still advances.
    const recordingId: string | null =
      result.recording && this.uploader
        ? await this.uploader.upload(result.recording)
        : null;

    const { error: logErr } = await this.client.from('review_log').insert({
      user_id: this.userId,
      item_type: itemType,
      item_id: result.itemId,
      card_kind: result.cardKind,
      correct: result.correct ?? null,
      spoke: result.spoke ?? null,
      self_rating: result.selfRating ?? null,
      latency_ms: result.latencyMs ?? null,
      interval_label: label,
      recording_id: recordingId,
    });
    if (logErr) throw logErr;

    // graduation floors evaluated AFTER the FSRS state write (spec §6 C2)
    // Load cumulative receptive/productive counts from review_log. repKind() is the single source
    // of truth for the split (production card-kinds are completion-counted, not correctness-gated —
    // see cardTemplate.ts), so classification happens there, not via an inline card-kind set here.
    // The rung is DERIVED — no rung/ladder column is written; review_state.stage is untouched.
    const { data: logData } = await this.client
      .from('review_log')
      .select('card_kind,correct')
      .eq('user_id', this.userId)
      .eq('item_id', result.itemId);

    let receptiveReps = 0;
    let productiveReps = 0;
    if (logData) {
      for (const row of logData as Array<{ card_kind: string; correct: boolean | null }>) {
        const kind = repKind(row.card_kind, row.correct);
        if (kind === 'productive') productiveReps += 1;
        else if (kind === 'receptive') receptiveReps += 1;
      }
    }
    const currentRung = computeRung(receptiveReps, productiveReps);

    return { nextReviewLabel: label, rung: currentRung };
  }

  async getDueSummary(): Promise<{ newCount: number; reviewCount: number }> {
    // Derive the Home preview from the SAME batch the session will run, so the two never disagree.
    // (A stage='new' COUNT on review_state is wrong here: the core loop sources new words from the
    // content tables and never persists a stage='new' row, so that count is effectively always 0.)
    // new = distinct words being introduced today (un-expanded); review = everything FSRS-due.
    const batch = await this.getDueBatch();
    let newCount = 0;
    let reviewCount = 0;
    for (const it of batch) {
      if (it.stage === 'new') newCount += 1;
      else reviewCount += 1;
    }
    return { newCount, reviewCount };
  }
}

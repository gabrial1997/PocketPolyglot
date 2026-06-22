// Supabase-backed SRS service. All scheduling logic lives in ./mappers (pure, tested);
// this class is the I/O wrapper: it queries review_state + content rows, runs the mappers,
// and persists review_state + review_log.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SrsService } from '../index';
import type { ReviewItem } from '../../types/reviewItem';
import type { CardResult } from '../../types/cardResult';
import type {
  DbItemType,
  LemmaRow,
  MinimalPairRow,
  PhraseRow,
  ReviewStateRow,
} from './types';
import {
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
import {
  DAY_ONE_NEW_CAP,
  RETENTION_MINIMUM_SAMPLE,
  RETENTION_WINDOW,
} from '../../session/pacing';
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

// ---------------------------------------------------------------------------
// Private pure helpers
// ---------------------------------------------------------------------------

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
  // Injectable clock for testability. The client optionally carries `_now` (set by
  // tests via fakeClient). Production code passes `new Date()`.
  private now(): Date {
    const c = this.client as unknown as { _now?: Date };
    return c._now instanceof Date ? c._now : new Date();
  }

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  // -------------------------------------------------------------------------
  // Private helpers — one DB query each; all injectable through `this.client`.
  // -------------------------------------------------------------------------

  /** Count introduction events today (word/learn-* or phrase/hear card_kind). */
  private async introducedToday(now: Date): Promise<number> {
    const dayStart = startOfLocalDay(now).toISOString();
    const { data } = await this.client
      .from('review_log')
      .select('item_id')
      .eq('user_id', this.userId)
      .or(`card_kind.like.word/learn-%,card_kind.eq.phrase/hear`)
      .gte('created_at', dayStart)
      .lte('created_at', now.toISOString());
    if (!data) return 0;
    return new Set((data as Array<{ item_id?: string }>).map(r => r.item_id)).size;
  }

  /** Days since the account was created. Falls back to earliest review_log.created_at. */
  private async accountAgeDays(now: Date): Promise<number> {
    // Try profiles.created_at first.
    const { data: profile } = await this.client
      .from('profiles')
      .select('created_at')
      .eq('user_id', this.userId)
      .maybeSingle();
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
    const { data } = await this.client
      .from('review_log')
      .select('correct')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(RETENTION_WINDOW);
    if (!data) return undefined;
    const rows = data as Array<{ correct?: boolean | null }>;
    const graded = rows.filter(r => r.correct !== null && r.correct !== undefined);
    if (graded.length < RETENTION_MINIMUM_SAMPLE) return undefined;
    const correct = graded.filter(r => r.correct === true).length;
    return correct / graded.length;
  }

  /** lemma ids with ≥1 review_log row correct=true (used for the i+1 anchor check). */
  private async recalledLemmaIds(): Promise<Set<string>> {
    const { data } = await this.client
      .from('review_log')
      .select('item_id')
      .eq('user_id', this.userId)
      .eq('item_type', 'lemma')
      .eq('correct', true);
    if (!data) return new Set();
    return new Set((data as Array<{ item_id?: string }>).map(r => r.item_id).filter(Boolean) as string[]);
  }

  /** lemma ids the user "knows" (known_lemmas view, security_invoker=true verified). */
  private async knownLemmaIds(): Promise<Set<string>> {
    const { data } = await this.client
      .from('known_lemmas')
      .select('lemma_id')
      .eq('user_id', this.userId);
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
    const { data: stateData } = await this.client
      .from('review_state')
      .select('item_id')
      .eq('user_id', this.userId)
      .eq('item_type', 'lemma');
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
      const { data: chunk } = await this.client
        .from('lemmas')
        .select('*')
        .order('utility_rank', { ascending: true, nullsFirst: false })
        .range(offset, offset + CHUNK - 1);
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
    const { data: stateData } = await this.client
      .from('review_state')
      .select('item_id')
      .eq('user_id', this.userId)
      .eq('item_type', 'phrase');
    const introducedIds = new Set(
      ((stateData ?? []) as Array<{ item_id?: string }>).map(r => r.item_id).filter(Boolean) as string[]
    );

    // Page through phrases in created_at/id order, skipping already-introduced, until we have enough.
    const TARGET = DAY_ONE_NEW_CAP * 4;
    const CHUNK = 200;
    const collectedRows: PhraseRow[] = [];
    let offset = 0;
    let exhausted = false;

    while (collectedRows.length < TARGET && !exhausted) {
      const { data: chunk } = await this.client
        .from('phrases')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + CHUNK - 1);
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
      const { data: comps } = await this.client
        .from('phrase_components')
        .select('phrase_id,lemma_id,position')
        .in('phrase_id', phraseIds);
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

  // -------------------------------------------------------------------------
  // Main public method — rewritten for B2.
  // -------------------------------------------------------------------------

  async getDueBatch(): Promise<ReviewItem[]> {
    const now = this.now();
    const nowIso = now.toISOString();

    // ------------------------------------------------------------------
    // 1. Fetch due items: review_state WHERE due_at <= now (drop stage='new' clause).
    //    Due items are UNCAPPED — selectBatch returns them all.
    // ------------------------------------------------------------------
    const { data: dueStateData, error: dueErr } = await this.client
      .from('review_state')
      .select('*')
      .eq('user_id', this.userId)
      .or(`due_at.lte.${nowIso}`)
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
    //    We need content metadata (hasAudioEnvelope, hasImage) for each due item.
    // ------------------------------------------------------------------

    // Fetch content for due items to build DueRef (we need audio/image info).
    const dueByType: Record<DbItemType, string[]> = {
      lemma: [],
      phrase: [],
      pair: [],
      wordform: [],
    };
    for (const s of allDueRows) {
      dueByType[s.item_type]?.push(s.item_id);
    }

    // Fetch lemma content for due items.
    const dueLemmaMap = new Map<string, LemmaRow>();
    if (dueByType.lemma.length > 0) {
      const { data: dl } = await this.client.from('lemmas').select('*').in('id', dueByType.lemma);
      for (const r of (dl ?? []) as LemmaRow[]) dueLemmaMap.set(r.id, r);
    }
    const duePhraseMap = new Map<string, PhraseRow>();
    if (dueByType.phrase.length > 0) {
      const { data: dp } = await this.client.from('phrases').select('*').in('id', dueByType.phrase);
      for (const r of (dp ?? []) as PhraseRow[]) duePhraseMap.set(r.id, r);
    }
    const duePairMap = new Map<string, MinimalPairRow>();
    if (dueByType.pair.length > 0) {
      const { data: dpa } = await this.client.from('minimal_pairs').select('*').in('id', dueByType.pair);
      for (const r of (dpa ?? []) as MinimalPairRow[]) duePairMap.set(r.id, r);
    }

    // Build DueRef[] preserving allDueRows order.
    const dueRefs: DueRef[] = [];
    for (const s of allDueRows) {
      let hasAudioEnvelope = false;
      let hasImage = false;
      if (s.item_type === 'lemma') {
        const r = dueLemmaMap.get(s.item_id);
        if (r) {
          hasAudioEnvelope = !!(r.envelope && r.envelope.length > 0);
          hasImage = !!(r.media?.imageUrl);
        }
      } else if (s.item_type === 'phrase') {
        const r = duePhraseMap.get(s.item_id);
        if (r) {
          hasAudioEnvelope = !!(r.envelope && r.envelope.length > 0);
          // phrases have no imageUrl
        }
      } else if (s.item_type === 'pair') {
        const r = duePairMap.get(s.item_id);
        if (r) {
          hasAudioEnvelope = !!(r.envelope && r.envelope.length > 0);
        }
      }
      dueRefs.push({
        id: s.item_id,
        kind: s.item_type === 'lemma' ? 'word' : s.item_type === 'phrase' ? 'phrase' : 'pair',
        hasAudioEnvelope,
        hasImage,
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
        .order('due_at', { ascending: true })
        .limit(PRACTICE_BATCH);
      if (practiceErr) throw practiceErr;
      const practiceRows: ReviewStateRow[] = (practice ?? []) as ReviewStateRow[];
      if (practiceRows.length === 0) return [];
      // Build a minimal batch from practice rows (review-only, no new candidates).
      // We reuse the existing enrichment path below by re-routing through `rows`.
      return this.enrichAndReorder(practiceRows, now, nowIso);
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
        // New item — synthetic state row (no DB row yet).
        orderedStates.push({
          user_id: this.userId,
          item_type: dbType,
          item_id: entry.id,
          stage: 'new',
          reps: 0,
          lapses: 0,
          stability: null,
          difficulty: null,
          due_at: null,
          last_review: null,
        } as unknown as ReviewStateRow);
      }
    }

    return this.enrichAndReorder(orderedStates, now, nowIso, {
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
    nowIso: string,
    prefetched?: {
      dueLemmaMap: Map<string, LemmaRow>;
      duePhraseMap: Map<string, PhraseRow>;
      duePairMap: Map<string, MinimalPairRow>;
      candidateLemmaRows: LemmaRow[];
      candidatePhraseRows: PhraseRow[];
    },
  ): Promise<ReviewItem[]> {
    void nowIso; // unused directly; kept for signature clarity

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
      const { data } = await this.client.from('lemmas').select('*').in('id', missingLemmaIds);
      for (const r of (data ?? []) as LemmaRow[]) lemmaMap.set(r.id, r);
    }
    if (missingPhraseIds.length > 0) {
      const { data } = await this.client.from('phrases').select('*').in('id', missingPhraseIds);
      for (const r of (data ?? []) as PhraseRow[]) phraseMap.set(r.id, r);
    }
    if (missingPairIds.length > 0) {
      const { data } = await this.client.from('minimal_pairs').select('*').in('id', missingPairIds);
      for (const r of (data ?? []) as MinimalPairRow[]) pairMap.set(r.id, r);
    }

    // Build items in orderedStates sequence.
    const items: ReviewItem[] = [];
    const stateByKey = new Map<string, ReviewStateRow>();
    for (const s of orderedStates) stateByKey.set(`${s.item_type}:${s.item_id}`, s);

    for (const s of orderedStates) {
      if (s.item_type === 'lemma') {
        const row = lemmaMap.get(s.item_id);
        if (!row) continue;
        const item = lemmaRowToReviewItem(row, stateByKey.get(`lemma:${row.id}`));
        // Distractors (graceful fallback on error).
        try {
          const { data: distractors } = await this.client.rpc('get_distractors', {
            target: row.id,
            n: 3,
          });
          item.choices = [
            { value: item.target, gloss: item.gloss, correct: true },
            ...((distractors ?? []) as LemmaRow[]).map((d) => ({
              value: d.lemma,
              gloss: d.gloss_en,
              correct: false,
            })),
          ];
        } catch {
          // Leave choices undefined; cards degrade gracefully.
        }
        items.push(item);
      } else if (s.item_type === 'phrase') {
        const row = phraseMap.get(s.item_id);
        if (!row) continue;
        const item = phraseRowToReviewItem(row, stateByKey.get(`phrase:${row.id}`));
        const { data: components } = await this.client
          .from('phrase_components')
          .select('lemma_id')
          .eq('phrase_id', row.id);
        if (components) {
          item.componentLemmaIds = (components as { lemma_id: string }[]).map((c) => c.lemma_id);
        }
        items.push(item);
      } else if (s.item_type === 'pair') {
        const row = pairMap.get(s.item_id);
        if (!row) continue;
        items.push(pairRowToReviewItem(row, stateByKey.get(`pair:${row.id}`)));
      }
    }

    // Attach projected next-review labels.
    for (const item of items) {
      const state = stateByKey.get(`${itemTypeToDbType(item.type)}:${item.id}`);
      item.reviewPreview = projectReviewLabels(rowToPrior(state), now);
    }

    return items;
  }

  async submit(result: CardResult): Promise<{ nextReviewLabel: string }> {
    const now = new Date();
    const itemType = cardKindToDbType(result.cardKind);
    const rating = cardResultToRating(result);

    // Load the prior schedule (may be absent for a brand-new item).
    const { data: prevRow, error: prevErr } = await this.client
      .from('review_state')
      .select('*')
      .eq('user_id', this.userId)
      .eq('item_type', itemType)
      .eq('item_id', result.itemId)
      .maybeSingle();
    if (prevErr) throw prevErr;

    const prevState = prevRow as ReviewStateRow | null;
    const prior = rowToPrior(prevState);

    const next = schedule(prior, rating, now);
    const label = nextReviewLabel(next.due, now);

    const { error: upsertErr } = await this.client.from('review_state').upsert(
      {
        user_id: this.userId,
        item_type: itemType,
        item_id: result.itemId,
        stage: next.stage,
        reps: next.reps,
        lapses: next.lapses,
        stability: next.stability,
        difficulty: next.difficulty,
        due_at: next.due.toISOString(),
        last_review: next.last_review.toISOString(),
      },
      { onConflict: 'user_id,item_type,item_id' },
    );
    if (upsertErr) throw upsertErr;

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
    });
    if (logErr) throw logErr;

    return { nextReviewLabel: label };
  }

  async getDueSummary(): Promise<{ newCount: number; reviewCount: number }> {
    const nowIso = new Date().toISOString();

    const { count: newCount, error: newErr } = await this.client
      .from('review_state')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .eq('stage', 'new');
    if (newErr) throw newErr;

    // "Due" = scheduled (not new) with due_at in the past.
    const { count: reviewCount, error: dueErr } = await this.client
      .from('review_state')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .neq('stage', 'new')
      .lte('due_at', nowIso);
    if (dueErr) throw dueErr;

    return { newCount: newCount ?? 0, reviewCount: reviewCount ?? 0 };
  }
}

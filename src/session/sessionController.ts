// SessionController — the one stateful piece (BACKEND_INTEGRATION §2).
// Flow: getDueBatch -> renderFor(item) -> mount card with item + callbacks -> on complete,
// submit(result) to SRS and advance. The card stays pure; this hook owns batch + services.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { decideKind } from './decideKind';
import { requeueArcNext, lockHint } from './requeue';
import { expandLearningSteps } from './learningSteps';
import { LEARNING_STEP_GROUP_SIZE } from './pacing';
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';
import type { CardKind } from '../types/cardKind';

export interface SessionState {
  loading: boolean;
  done: boolean;
  /** Current item + the CardKind to render for it (null when loading/done). */
  current: { item: ReviewItem; kind: CardKind } | null;
  /** 1-based position for the SessionTop progress dots. */
  step: number;
  total: number;
  /** Submit a card's result, post to SRS, advance to the next item. */
  submit: (result: CardResult) => Promise<void>;
  /**
   * Advance to the next item WITHOUT posting a review — the gate-card path (phrase/locked,
   * phrase/unlock are gating UI, not reviews, so they must NOT call srs.submit).
   */
  advance: () => void;
  /** Reload a fresh batch. */
  reload: () => Promise<void>;
}

/**
 * useSession — drives one daily batch. Phrase lock state (locked/unlock) is resolved here
 * against KnownWordsStore before deciding the kind; renderFor() handles the review kinds.
 */
export function useSession(): SessionState {
  const { srs, known } = useServices();
  // The working queue: seeded from getDueBatch, then mutated only for the unlock reveal, which
  // inserts its own hear->MC->speak arc immediately next. `pos` walks it. A locked phrase is
  // never re-inserted (see `advance()`).
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(true);
  // Phrase ids whose one-time unlock reveal has already been shown (so it never repeats).
  // Every NEW phrase opens with the reveal (building blocks — arriving IS an unlock); a ref
  // (not state) — recording it must not trigger a re-render.
  const revealed = useRef<Set<string>>(new Set());
  // Idempotency latch: true once an advance has fired for the CURRENT position, so a double-tapped
  // Continue (submit/advance firing twice on the same card before it re-renders) can't skip an item
  // or double-post. Reset whenever `pos` changes (i.e. a fresh card is shown).
  const advancing = useRef(false);
  // Refresh generation: bumped when reload()'s known.refresh() lands. `known` is a stable service
  // instance whose all() returns a mutable internal set (now serving the EARNED set — correct
  // recognition/recall in a DIFFERENT round or day than a word's intro, never this same sitting),
  // so neither `pos` (still 0) nor `known` changes after the first load — without this tick the
  // FIRST card's known set would be read from the pre-refresh set and never recomputed (a
  // fully-known phrase at position 0 rendered phrase/locked and was silently dropped by advance()).
  const [knownGen, setKnownGen] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    await known.refresh();
    setKnownGen((g) => g + 1); // the persisted earned set just (re)loaded — recompute the gate
    const items = await srs.getDueBatch();
    setQueue(expandLearningSteps(items, LEARNING_STEP_GROUP_SIZE));
    setPos(0);
    revealed.current = new Set();
    setLoading(false);
  }, [srs, known]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const item = queue[pos];

  // A fresh card is up — re-arm the advance latch so its Continue works.
  useEffect(() => {
    advancing.current = false;
  }, [pos]);

  // The known-word set the gate sees = KnownWordsStore.all(), which now serves the EARNED set
  // directly (SupabaseKnownWordsStore.refresh() — Task 3) — no in-session overlay is unioned in,
  // so a word answered correctly THIS session can never unlock a phrase THIS session (no
  // same-session unlock, by design). `known.all()` returns a mutable internal set, so this is
  // re-read (not just re-identified) on every position change and on `knownGen` bumps: `revealed`
  // is a ref that mutates between renders, and a re-queued phrase is the SAME object at two
  // positions, so `pos` (not `item`) is the reliable signal that we've moved to a fresh encounter;
  // `knownGen` covers the remaining gap — position 0 never changes across reload(), so the refresh
  // tick forces the post-refresh recompute there.
  const earned = useMemo(
    () => new Set<string>(known.all()),
    [pos, known, knownGen], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const kind: CardKind | null = useMemo(() => {
    if (!item) return null;
    // Phrase gating: decideKind consults the earned set + revealed to pick locked/unlock/hear;
    // everything else falls through to renderFor. Pure — no ref mutation here.
    return decideKind(item, earned, revealed.current).kind;
  }, [item, earned, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record gate renders AFTER render (the useMemo must stay pure). Once a phrase's unlock
  // reveal is shown, `revealed` retires it — the next encounter renders the review kind.
  useEffect(() => {
    if (item && kind === 'phrase/unlock') revealed.current.add(item.id);
  }, [item, kind]);

  const submit = useCallback(
    async (result: CardResult) => {
      // Idempotency: a double-tapped Continue must not advance twice or post twice (see `advancing`).
      if (advancing.current) return;
      advancing.current = true;
      // Advance the deck IMMEDIATELY, before awaiting the network. A slow or failing srs.submit must
      // never strand the learner on a card whose Continue has already fired and now does nothing
      // (bug 4 — the dead-CTA hang). Post in the background and reconcile the review label when it
      // lands; a failed post is logged, not surfaced — the item just stays due and re-surfaces.
      setPos((p) => p + 1);
      try {
        await srs.submit(result);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[session] srs.submit failed; deck already advanced', err);
      }
    },
    [srs],
  );

  // Gate advance (locked/unlock): NO srs.submit — these produce no CardResult (BACKEND_INTEGRATION
  // §4). The 'phrase/locked' teaser is NOT re-queued (earned-phrase gating, 2026-07-23): a locked
  // phrase shows exactly once per session — it only returns via selectBatch in a later round, once
  // its words are earned. The 'phrase/unlock' reveal still inserts its own hear->MC->speak arc.
  const advance = useCallback(() => {
    // Same idempotency latch as submit() — a double-tapped gate Continue must only step once.
    if (advancing.current) return;
    advancing.current = true;
    if (item && item.type === 'phrase' && kind === 'phrase/unlock') {
      // Re-surface as the full teach->MC->speak arc, same as a batch-admitted phrase gets from
      // expandLearningSteps (the unlock-gated item in the queue may already carry a retest
      // marker from a prior encounter — requeueArcNext normalizes the inserted intro copy).
      setQueue((q) => requeueArcNext(q, pos, item));
    }
    setPos((p) => p + 1);
  }, [item, kind, pos]);

  const done = !loading && pos >= queue.length;

  // On the locked card, enrich the item with the live "N words to go — learn X" hint.
  const current =
    item && kind
      ? { item: kind === 'phrase/locked' ? { ...item, ...lockHint(queue, item, earned) } : item, kind }
      : null;

  return {
    loading,
    done,
    current,
    step: Math.min(pos + 1, queue.length || 1),
    total: queue.length,
    submit,
    advance,
    reload,
  };
}

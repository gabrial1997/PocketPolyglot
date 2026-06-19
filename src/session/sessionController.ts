// SessionController — the one stateful piece (BACKEND_INTEGRATION §2).
// Flow: getDueBatch -> renderFor(item) -> mount card with item + callbacks -> on complete,
// submit(result) to SRS and advance. The card stays pure; this hook owns batch + services.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { decideKind } from './decideKind';
import { requeuePhraseAfterComponents, requeueNext, lockHint } from './requeue';
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
  /** Last "next review in N days" label handed back by SRS (cards display this). */
  lastReviewLabel: string | null;
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
  // The working queue: seeded from getDueBatch, then mutated as gated phrases re-surface
  // (locked -> after their words; unlock -> immediately next). `pos` walks it.
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastReviewLabel, setLastReviewLabel] = useState<string | null>(null);
  // Phrase ids seen LOCKED this session. A later available render of the same phrase becomes the
  // one-time 'phrase/unlock' reveal. A ref (not state) — recording it must not trigger a re-render.
  const seenLocked = useRef<Set<string>>(new Set());
  // Phrase ids whose one-time unlock reveal has already been shown (so it never repeats).
  const revealed = useRef<Set<string>>(new Set());
  // Optimistic in-session known overlay (lemma ids learned THIS session). Lets "learn a word"
  // change a later phrase's lock state without a network round-trip.
  const learned = useRef<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    await known.refresh();
    const items = await srs.getDueBatch();
    setQueue(items);
    setPos(0);
    seenLocked.current = new Set();
    revealed.current = new Set();
    learned.current = new Set();
    setLoading(false);
  }, [srs, known]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const item = queue[pos];

  // The known-word set the gate sees = the persisted store UNION the in-session overlay. Recomputed
  // on every position change — `learned`/`revealed` are refs that mutate between renders, and a
  // re-queued phrase is the SAME object at two positions, so `pos` (not `item`) is the reliable
  // signal that we have moved to a fresh encounter.
  const knownUnion = useMemo(
    () => new Set<string>([...known.all(), ...learned.current]),
    [pos, known], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const kind: CardKind | null = useMemo(() => {
    if (!item) return null;
    // Phrase gating: decideKind consults knownUnion + seenLocked + revealed to pick
    // locked/unlock/hear; everything else falls through to renderFor. Pure — no ref mutation here.
    return decideKind(item, knownUnion, seenLocked.current, revealed.current).kind;
  }, [item, knownUnion, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record gate renders AFTER render (the useMemo must stay pure). A later available render of a
  // seenLocked phrase resolves to 'phrase/unlock'; once that unlock is shown, `revealed` retires it.
  useEffect(() => {
    if (item && kind === 'phrase/locked') seenLocked.current.add(item.id);
    if (item && kind === 'phrase/unlock') revealed.current.add(item.id);
  }, [item, kind]);

  const submit = useCallback(
    async (result: CardResult) => {
      // A learned word immediately changes lock state for later phrases (optimistic overlay).
      if (item && item.type === 'word') learned.current.add(item.id);
      const { nextReviewLabel } = await srs.submit(result);
      setLastReviewLabel(nextReviewLabel);
      setPos((p) => p + 1);
    },
    [srs, item],
  );

  // Gate advance (locked/unlock): NO srs.submit and no lastReviewLabel update — these produce no
  // CardResult (BACKEND_INTEGRATION §4). Re-queue the phrase so it re-surfaces at the right spot.
  const advance = useCallback(() => {
    if (item && item.type === 'phrase' && kind === 'phrase/locked') {
      // Re-surface after the last component word still ahead in the queue.
      setQueue((q) => requeuePhraseAfterComponents(q, pos, item));
    } else if (item && item.type === 'phrase' && kind === 'phrase/unlock') {
      // Re-surface immediately as the first SRS exposure (phrase/hear).
      setQueue((q) => requeueNext(q, pos, item));
    }
    setPos((p) => p + 1);
  }, [item, kind, pos]);

  const done = !loading && pos >= queue.length;

  // On the locked card, enrich the item with the live "N words to go — learn X" hint.
  const current =
    item && kind
      ? { item: kind === 'phrase/locked' ? { ...item, ...lockHint(queue, item, knownUnion) } : item, kind }
      : null;

  return {
    loading,
    done,
    current,
    step: Math.min(pos + 1, queue.length || 1),
    total: queue.length,
    lastReviewLabel,
    submit,
    advance,
    reload,
  };
}

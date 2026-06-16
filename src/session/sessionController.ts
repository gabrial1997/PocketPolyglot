// SessionController — the one stateful piece (BACKEND_INTEGRATION §2).
// Flow: getDueBatch -> renderFor(item) -> mount card with item + callbacks -> on complete,
// submit(result) to SRS and advance. The card stays pure; this hook owns batch + services.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { decideKind } from './decideKind';
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
  const [batch, setBatch] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastReviewLabel, setLastReviewLabel] = useState<string | null>(null);
  // Phrase ids seen LOCKED this session. A later available render of the same phrase becomes the
  // one-time 'phrase/unlock' reveal. A ref (not state) — recording it must not trigger a re-render.
  const seenLocked = useRef<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    await known.refresh();
    const items = await srs.getDueBatch();
    setBatch(items);
    setIndex(0);
    setLoading(false);
  }, [srs, known]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const item = batch[index];

  const kind: CardKind | null = useMemo(() => {
    if (!item) return null;
    // Phrase gating (i+1): decideKind consults the known-word set + seenLocked to pick
    // locked/unlock; everything else falls through to renderFor. Pure — no ref mutation here.
    return decideKind(item, known.all(), seenLocked.current).kind;
  }, [item, known]);

  // Record locked phrases AFTER render (the useMemo must stay pure). A later available render of
  // the same phrase id then resolves to 'phrase/unlock' via seenLocked.
  useEffect(() => {
    if (item && kind === 'phrase/locked') seenLocked.current.add(item.id);
  }, [item, kind]);

  const submit = useCallback(
    async (result: CardResult) => {
      const { nextReviewLabel } = await srs.submit(result);
      setLastReviewLabel(nextReviewLabel);
      setIndex((i) => i + 1);
    },
    [srs],
  );

  // Gate advance: same index step as submit, but no SRS post and no lastReviewLabel update —
  // locked/unlock produce no CardResult (BACKEND_INTEGRATION §4).
  const advance = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  const done = !loading && index >= batch.length;

  return {
    loading,
    done,
    current: item && kind ? { item, kind } : null,
    step: Math.min(index + 1, batch.length || 1),
    total: batch.length,
    lastReviewLabel,
    submit,
    advance,
    reload,
  };
}

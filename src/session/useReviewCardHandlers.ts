// useReviewCardHandlers — the React adapter that binds a card's events to the injected services.
// All the logic lives in createCardHandlers (cardWiring.ts, unit-tested); this just supplies the
// services from context and a stable per-card recording store. Controller-side only: cards never
// call useServices themselves (BACKEND_INTEGRATION §5).
import { useMemo, useRef } from 'react';
import { useServices } from '../services/ServiceProvider';
import { useHaptics } from '../haptics';
import { createCardHandlers, type CardHandlers, type RecordingStore } from './cardWiring';
import type { ReviewItem } from '../types/reviewItem';
import type { CardResult } from '../types/cardResult';

export function useReviewCardHandlers(
  item: ReviewItem,
  submit: (result: CardResult) => void | Promise<void>,
  advance: () => void,
): CardHandlers {
  const { audio, recorder } = useServices();
  const { unlock } = useHaptics();
  // One take buffer per mounted card; survives re-renders without re-creating handlers.
  const store = useRef<RecordingStore>({ current: null }).current;
  return useMemo(
    () => createCardHandlers({ item, audio, recorder, store, submit, advance, haptics: { unlock } }),
    [item, audio, recorder, store, submit, advance, unlock],
  );
}

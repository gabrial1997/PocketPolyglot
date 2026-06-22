// PlaybackContext — a UI read-model carrying the live audio status to the soundbar. This is NOT a
// service (cards may read it like useTheme); it is populated on the controller side by
// PlaybackProvider from AudioService.subscribe. Default is inert so any tree without a provider
// (tests, the card gallery) degrades to usePlayClip's timer fallback.
import { createContext, useContext } from 'react';
import type { PlaybackStatus } from '../types/playback';

const INERT: PlaybackStatus = { playing: false, positionMs: 0, durationMs: 0 };

export const PlaybackStatusContext = createContext<PlaybackStatus>(INERT);

/** Live playback status for the current clip. Inert when no PlaybackProvider is mounted. */
export function usePlaybackStatus(): PlaybackStatus {
  return useContext(PlaybackStatusContext);
}

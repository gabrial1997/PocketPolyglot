// PlaybackProvider — controller-side bridge. Subscribes to the injected AudioService and pushes
// its live status into PlaybackStatusContext so the soundbar (via usePlayClip) tracks the real
// voice. Mounted around the card host; uses useServices (controller-only), never a card.
import React, { useEffect, useState } from 'react';
import { useServices } from '../services/ServiceProvider';
import { PlaybackStatusContext } from '../components/PlaybackContext';
import type { PlaybackStatus } from '../types/playback';

const INERT: PlaybackStatus = { playing: false, positionMs: 0, durationMs: 0 };

export function PlaybackProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { audio } = useServices();
  const [status, setStatus] = useState<PlaybackStatus>(INERT);
  useEffect(() => audio.subscribe(setStatus), [audio]);
  return <PlaybackStatusContext.Provider value={status}>{children}</PlaybackStatusContext.Provider>;
}

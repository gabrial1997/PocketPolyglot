// usePlayClip — the shared "play a clip and gate the soundbar" hook. Every audio card runs the
// same dance: fire playback, light the LiveWaveform for the clip's known length, then settle it
// back to rest. The card can't observe playback end through the service boundary yet (soundbar.md),
// so we time the gate off the precomputed envelope's length (real amplitudes; only the stop is
// approximated). Extracted from PhraseHear so every card shares one timing source of truth.
import { useCallback, useEffect, useRef, useState } from 'react';

export const FRAME_MS = 30; // must match content-pipeline/tts.mjs envelope frame size
const TAIL_MS = 200; // small pad so the bar doesn't cut off on the final syllable
const FALLBACK_MS = 1600; // no envelope: run the bar for a plausible single-word beat

/** Gate length for a clip: its envelope's real duration, or a short fallback when none was seeded. */
export function clipMs(envelope?: number[]): number {
  return envelope && envelope.length ? envelope.length * FRAME_MS + TAIL_MS : FALLBACK_MS;
}

/**
 * Drives a soundbar's `playing` flag for one clip at a time.
 * - `play(fire?)` fires the supplied playback callback (e.g. `() => onPlay('native')`), then holds
 *   `playing` true for `clipMs(envelope)`. Calling it again restarts the clip (tap-to-replay).
 * - `stop()` clears the gate immediately — call it when a card leaves the audio stage.
 * The timer is cleared on unmount so a card that glides away never flips state post-unmount.
 */
export function usePlayClip(envelope?: number[]): {
  playing: boolean;
  play: (fire?: () => void) => void;
  stop: () => void;
} {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback((): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const play = useCallback(
    (fire?: () => void): void => {
      fire?.();
      clear();
      setPlaying(true);
      timer.current = setTimeout(() => {
        setPlaying(false);
        timer.current = null;
      }, clipMs(envelope));
    },
    [envelope, clear],
  );

  const stop = useCallback((): void => {
    clear();
    setPlaying(false);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { playing, play, stop };
}

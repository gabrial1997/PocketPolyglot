// usePlayClip — the shared "play a clip and gate the soundbar" hook. Every audio card runs the
// same dance: fire playback, light the LiveWaveform, then settle it back to rest. When the
// controller's PlaybackProvider is reporting a real clip (known duration), the hook trusts that
// live stream for both `playing` and `positionMs` so the bar tracks the actual voice (bugs 2/5).
// Otherwise — the stub (durationMs:0) or no provider (card gallery, tests) — it falls back to a
// timer gated off the precomputed envelope length, scaled by 1/rate so a slowed clip lights the
// bar proportionally longer. Extracted from PhraseHear so every card shares one timing source.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaybackStatus } from './PlaybackContext';

export const FRAME_MS = 30; // must match content-pipeline/tts.mjs envelope frame size
const TAIL_MS = 200; // small pad so the bar doesn't cut off on the final syllable
const FALLBACK_MS = 1600; // no envelope: run the bar for a plausible single-word beat

/** Gate length for a clip: its envelope's real duration, or a short fallback when none was seeded. */
export function clipMs(envelope?: number[]): number {
  return envelope && envelope.length ? envelope.length * FRAME_MS + TAIL_MS : FALLBACK_MS;
}

/**
 * Drives a soundbar's `playing` flag (and real `positionMs` when available) for one clip at a time.
 * - `play(fire?, rate?)` fires the supplied playback callback (e.g. `() => onPlay('native')`),
 *   records the rate, and holds `playing` true for `clipMs(envelope)/rate` in timer mode. Calling
 *   it again restarts the clip (tap-to-replay).
 * - `positionMs` is the real media position in "real mode"; `undefined` in timer mode (LiveWaveform
 *   then runs its own rate-scaled clock).
 * - `rate` is the rate the last `play()` ran at (default 1); LiveWaveform uses it to scale.
 * - `stop()` clears the gate immediately — call it when a card leaves the audio stage.
 * The timer is cleared on unmount so a card that glides away never flips state post-unmount.
 */
export function usePlayClip(envelope?: number[]): {
  playing: boolean;
  positionMs?: number;
  rate: number;
  play: (fire?: () => void, rate?: number) => void;
  stop: () => void;
} {
  const status = usePlaybackStatus();
  const [timerPlaying, setTimerPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback((): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const play = useCallback(
    (fire?: () => void, playRate = 1): void => {
      fire?.();
      clear();
      setRate(playRate);
      setTimerPlaying(true);
      // Fallback gate (timer mode). Scaled by 1/rate so a slowed clip lights the bar longer (bug 5).
      // When real audio reports a known duration the render below ignores this flag.
      timer.current = setTimeout(() => {
        setTimerPlaying(false);
        timer.current = null;
      }, clipMs(envelope) / playRate);
    },
    [envelope, clear],
  );

  const stop = useCallback((): void => {
    clear();
    setTimerPlaying(false);
  }, [clear]);

  useEffect(() => clear, [clear]);

  // Real mode: the controller's PlaybackProvider is reporting an actual clip (known duration) AND
  // *this* hook started it — `timerPlaying` is set only by our own play(), so it is the clip-identity
  // scope the global status lacks. Without it, any clip sounding anywhere (the unlock chime, the next
  // card auto-playing during a GlideViewport transition) would flip every mounted card's bar into real
  // mode and animate the wrong soundbar against the wrong envelope. The precomputed envelope IS the
  // real clip length, so `timerPlaying` spans the clip; a toggle-stop clears it and settles the orb at
  // once instead of waiting for the audio.stop() round-trip.
  const realDriven = timerPlaying && status.playing && status.durationMs > 0;
  return {
    playing: realDriven ? true : timerPlaying,
    positionMs: realDriven ? status.positionMs : undefined,
    rate,
    play,
    stop,
  };
}

// ExpoAudioService — the real AudioService backed by expo-audio. Cards never import this; it is
// injected via the ServiceBundle and reached through the card's onPlay callback (BACKEND_INTEGRATION
// §5). "Slow" playback is a pitch-corrected rate change (shouldCorrectPitch), NOT a separate audio
// file — so the SpeedChip button slows the native clip without the chipmunk/pitch artifact.
//
// (SDK 54: expo-av was removed; this is the expo-audio port. Imperative createAudioPlayer is used
// instead of the useAudioPlayer hook because this is a plain service, not a component.)
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { AudioService, PlaybackStatus } from '../index';

let audioModeReady = false;
async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    // Play through the iOS silent switch — listening is one of the three core modalities
    // (hear / choose / say), so clips must sound even with the mute switch on.
    await setAudioModeAsync({ playsInSilentMode: true });
    // Flag only AFTER success: setting it before the await meant one rejection permanently
    // disabled the silent-switch config (never retried for the rest of the app session).
    audioModeReady = true;
  } catch {
    // Leave the flag unset so the next play() retries; playback itself still proceeds.
  }
}

export class ExpoAudioService implements AudioService {
  private player: AudioPlayer | null = null;
  private playing = false;
  // Monotonic token: every play()/stop() bumps it. A play() that finds `gen` changed after an
  // await knows a newer tap superseded it and bails — so two fire-and-forget taps (the device
  // "multiple voices" bug) can never both create a live player. See ExpoAudioService.test.ts.
  private gen = 0;
  private listeners = new Set<(s: PlaybackStatus) => void>();
  // A single pre-decoded "warm" player kept ready for the next play() of the same URL, so the first
  // tap of a card's audio doesn't pay the network/decode stall (bug 1). play() consumes it.
  private warm: { url: string; player: AudioPlayer } | null = null;

  subscribe(listener: (s: PlaybackStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(status: PlaybackStatus): void {
    for (const l of this.listeners) l(status);
  }

  async play(url: string, opts?: { rate?: number }): Promise<void> {
    const myGen = ++this.gen;
    // Tear down the previous player SYNCHRONOUSLY, before the first await — so a second tap (which
    // bumps `gen`) sees a cleared player immediately. Not via stop(): that would bump gen again.
    this.teardown();
    await ensureAudioMode();
    if (this.gen !== myGen) return; // a newer tap won the race while we awaited
    const rate = opts?.rate ?? 1.0;
    // Reuse the warm player when its URL matches; otherwise discard a stale warm one (so it can't
    // leak) and decode fresh.
    let player: AudioPlayer;
    if (this.warm && this.warm.url === url) {
      player = this.warm.player;
      this.warm = null;
    } else {
      if (this.warm) {
        try {
          this.warm.player.remove();
        } catch {
          /* already removed */
        }
        this.warm = null;
      }
      player = createAudioPlayer({ uri: url });
    }
    // Pitch-corrected rate: "slow" = native clip at e.g. 0.7× with pitch preserved.
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(rate, 'high');
    this.player = player;
    this.playing = true;
    player.addListener('playbackStatusUpdate', (status) => {
      if (this.gen !== myGen) return; // a newer tap superseded this player — do not leak its status
      if (status.didJustFinish) {
        this.playing = false;
        if (this.player === player) this.player = null;
        // expo-audio reports currentTime/duration in SECONDS — convert to ms for the UI bridge.
        this.emit({ playing: false, positionMs: status.duration * 1000, durationMs: status.duration * 1000 });
        player.remove();
        return;
      }
      this.emit({
        playing: status.playing,
        positionMs: status.currentTime * 1000,
        durationMs: status.duration * 1000,
      });
    });
    player.play();
  }

  async stop(): Promise<void> {
    this.gen++; // cancel any in-flight play() that is mid-await
    this.teardown();
    this.emit({ playing: false, positionMs: 0, durationMs: 0 });
  }

  isPlaying(): boolean {
    return this.playing;
  }

  preload(url: string): void {
    if (this.warm?.url === url || this.player) return; // already warm, or actively playing
    // Replacing a warm player for a *different* url (e.g. the next card preloads before this one's
    // warm was ever consumed): remove the stale one first so it can't leak a native decoder. Keeps
    // at most one outstanding warm player — the same "exactly one extra" discipline as the gen guard.
    if (this.warm) {
      try {
        this.warm.player.remove();
      } catch {
        /* already removed */
      }
      this.warm = null;
    }
    try {
      const player = createAudioPlayer({ uri: url });
      this.warm = { url, player };
    } catch {
      this.warm = null;
    }
  }

  private teardown(): void {
    this.playing = false;
    const current = this.player;
    this.player = null;
    if (current) {
      try {
        current.remove();
      } catch {
        /* already removed */
      }
    }
  }
}

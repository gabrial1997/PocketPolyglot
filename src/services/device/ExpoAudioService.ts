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
  audioModeReady = true;
  // Play through the iOS silent switch — this is an audio-first app.
  await setAudioModeAsync({ playsInSilentMode: true });
}

export class ExpoAudioService implements AudioService {
  private player: AudioPlayer | null = null;
  private playing = false;
  // Monotonic token: every play()/stop() bumps it. A play() that finds `gen` changed after an
  // await knows a newer tap superseded it and bails — so two fire-and-forget taps (the device
  // "multiple voices" bug) can never both create a live player. See ExpoAudioService.test.ts.
  private gen = 0;
  private listeners = new Set<(s: PlaybackStatus) => void>();

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
    const player = createAudioPlayer({ uri: url });
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

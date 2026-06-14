// ExpoAudioService — the real AudioService backed by expo-av. Cards never import this; it is
// injected via the ServiceBundle and reached through the card's onPlay callback (BACKEND_INTEGRATION
// §5). "Slow" playback is a pitch-corrected rate change (shouldCorrectPitch), NOT a separate audio
// file — so the SpeedChip button slows the native clip without the chipmunk/pitch artifact.
import { Audio } from 'expo-av';
import type { AudioService } from '../index';

let audioModeReady = false;
async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  audioModeReady = true;
  // Play through the iOS silent switch — this is an audio-first app.
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
}

export class ExpoAudioService implements AudioService {
  private sound: Audio.Sound | null = null;
  private playing = false;

  async play(url: string, opts?: { rate?: number }): Promise<void> {
    await this.stop();
    await ensureAudioMode();
    const rate = opts?.rate ?? 1.0;
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true, rate, shouldCorrectPitch: true },
    );
    this.sound = sound;
    this.playing = true;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        this.playing = false;
        void sound.unloadAsync().catch(() => undefined);
        if (this.sound === sound) this.sound = null;
      }
    });
  }

  async stop(): Promise<void> {
    this.playing = false;
    const current = this.sound;
    this.sound = null;
    if (current) {
      try {
        await current.unloadAsync();
      } catch {
        /* already unloaded */
      }
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }
}

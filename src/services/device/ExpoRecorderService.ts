// ExpoRecorderService — real device recorder backed by expo-audio's AudioRecorder.
// Cards never import this directly; it is injected via ServiceBundle.recorder (BACKEND_INTEGRATION §5).
// Phase 0: STORE + COMPARE ONLY — no scoring, no Whisper/GOP/ML anywhere.
//
// Contract (RecorderService):
//   start(): request permission, ensure record audio mode once, stop+release any still-active
//            recorder (never leave a hot mic behind), create a fresh AudioRecorder per take,
//            prepareToRecordAsync() then record(). Throws if permission denied.
//   stop():  await recorder.stop(), always restore playback audio mode (finally), return
//            recorder.uri (string). Throws if uri is null; a second stop() throws 'No active
//            recorder' — the reference is cleared on the first stop.
//   isRecording(): returns the internal flag — does NOT trust the SharedObject across awaits.
//
// Note: AudioRecorder is exposed as AudioModule.AudioRecorder (not a direct named value export —
// it is typed under `export type *` in expo-audio/index.d.ts but instantiated via the native module).
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';
import type { RecorderService } from '../index';

export class ExpoRecorderService implements RecorderService {
  private recorder: AudioRecorder | null = null;
  private recording = false;
  /** Guard: setAudioModeAsync is called at most once per service instance. */
  private recordModeReady = false;

  private async ensureRecordMode(): Promise<void> {
    if (this.recordModeReady) return;
    this.recordModeReady = true;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  }

  async start(): Promise<void> {
    // 1. Request mic permission every take (idempotent on native once granted).
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      throw new Error('Microphone permission denied — cannot start recording.');
    }

    // 2. Ensure record audio mode exactly once per service instance.
    await this.ensureRecordMode();

    // 3. Stop + release the previous recorder if one is still active (one recorder instance per
    //    take). Just nulling the reference would leave the old NATIVE recorder holding the mic
    //    open for the rest of the session.
    const previous = this.recorder;
    this.recorder = null;
    this.recording = false;
    if (previous) {
      try {
        await previous.stop();
      } catch {
        // Already stopped/released — nothing to clean up.
      }
    }

    // 4. Create a fresh AudioRecorder, prepare, then record.
    const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    this.recorder = recorder;
    this.recording = true;
  }

  async stop(): Promise<string> {
    // Clear the reference up front so a second stop() throws 'No active recorder' instead of
    // "succeeding" with a stale uri from the finished take.
    const recorder = this.recorder;
    this.recorder = null;
    this.recording = false;

    if (!recorder) {
      throw new Error('No active recorder — call start() first.');
    }

    try {
      await recorder.stop();
    } finally {
      // Restore playback routing. iOS leaves the session in playAndRecord (earpiece / ducked
      // output) after recording, which makes every subsequent clip quiet for the rest of the
      // session. Reset in a FINALLY so the session is always cleaned up — even when recorder.stop()
      // rejects or the take is interrupted/null. Clear the guard so the next start() re-applies
      // record mode (allowsRecording:true).
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      this.recordModeReady = false;
    }

    const uri = recorder.uri;
    if (uri === null) {
      throw new Error('Recording uri is null — the recording was interrupted or produced no output.');
    }

    return uri;
  }

  isRecording(): boolean {
    return this.recording;
  }
}

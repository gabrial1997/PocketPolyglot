// Supabase service implementations — barrel + factory.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceBundle } from '../index';
import { ExpoAudioService } from '../device/ExpoAudioService';
import { ExpoRecorderService } from '../device/ExpoRecorderService';
import { SupabaseSrsService } from './SupabaseSrsService';
import { SupabaseKnownWordsStore } from './SupabaseKnownWordsStore';
import { SupabaseProgressService } from './SupabaseProgressService';
import { SupabasePodcastService } from './SupabasePodcastService';
import { SupabaseProfileService } from './SupabaseProfileService';
import { SupabaseRecordingUploader } from './SupabaseRecordingUploader';

export * from './types';
export * from './mappers';
export { SupabaseSrsService } from './SupabaseSrsService';
export { SupabaseKnownWordsStore } from './SupabaseKnownWordsStore';
export { SupabaseProgressService } from './SupabaseProgressService';
export { SupabasePodcastService } from './SupabasePodcastService';
export { SupabaseProfileService } from './SupabaseProfileService';
export { SupabaseRecordingUploader } from './SupabaseRecordingUploader';
export type { RecordingUploader } from './SupabaseRecordingUploader';

/**
 * Build a ServiceBundle backed by Supabase for a given authenticated user.
 *
 * Audio is the real device player (ExpoAudioService — pitch-corrected rate for "slow"). The
 * recorder is the real device recorder (ExpoRecorderService — mic permission + expo-audio
 * AudioRecorder, Phase 0: store + compare only). The data-layer services (srs/known/progress/
 * podcast) are the real Supabase implementations.
 */
export function createSupabaseServices(
  client: SupabaseClient,
  userId: string,
): ServiceBundle {
  const profile = new SupabaseProfileService(client, userId);
  const uploader = new SupabaseRecordingUploader(
    client,
    userId,
    () => profile.getRecConsent(),
  );
  return {
    audio: new ExpoAudioService(),
    recorder: new ExpoRecorderService(),
    srs: new SupabaseSrsService(client, userId, uploader),
    known: new SupabaseKnownWordsStore(client, userId),
    progress: new SupabaseProgressService(client, userId),
    podcast: new SupabasePodcastService(client),
    profile,
  };
}

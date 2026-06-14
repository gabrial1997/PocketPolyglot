// Supabase service implementations — barrel + factory.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceBundle } from '../index';
import { StubAudioService, StubRecorderService } from '../stubs';
import { SupabaseSrsService } from './SupabaseSrsService';
import { SupabaseKnownWordsStore } from './SupabaseKnownWordsStore';
import { SupabaseProgressService } from './SupabaseProgressService';
import { SupabasePodcastService } from './SupabasePodcastService';

export * from './types';
export * from './mappers';
export { SupabaseSrsService } from './SupabaseSrsService';
export { SupabaseKnownWordsStore } from './SupabaseKnownWordsStore';
export { SupabaseProgressService } from './SupabaseProgressService';
export { SupabasePodcastService } from './SupabasePodcastService';

/**
 * Build a ServiceBundle backed by Supabase for a given authenticated user.
 *
 * NOTE: audio + recorder remain DEVICE stubs (StubAudioService / StubRecorderService) for now.
 * They are device concerns (playback, mic permission) wired separately later with expo-audio;
 * the data-layer services (srs/known/progress/podcast) are the real Supabase implementations.
 */
export function createSupabaseServices(
  client: SupabaseClient,
  userId: string,
): ServiceBundle {
  return {
    audio: new StubAudioService(),
    recorder: new StubRecorderService(),
    srs: new SupabaseSrsService(client, userId),
    known: new SupabaseKnownWordsStore(client, userId),
    progress: new SupabaseProgressService(client, userId),
    podcast: new SupabasePodcastService(client),
  };
}

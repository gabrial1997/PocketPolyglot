// Supabase-backed PodcastService. Reads the most recent podcast_episodes row.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PodcastService } from '../index';
import type { PodcastEpisodeRow } from './types';

export class SupabasePodcastService implements PodcastService {
  constructor(private readonly client: SupabaseClient) {}

  async getEpisode(): Promise<{ title: string; transcript: string; audioUrl: string }> {
    const { data, error } = await this.client
      .from('podcast_episodes')
      .select('title, transcript, audio_url')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const row = data as Pick<PodcastEpisodeRow, 'title' | 'transcript' | 'audio_url'> | null;
    if (!row) return { title: '', transcript: '', audioUrl: '' };

    return {
      title: row.title,
      transcript: row.transcript ?? '',
      audioUrl: row.audio_url,
    };
  }
}

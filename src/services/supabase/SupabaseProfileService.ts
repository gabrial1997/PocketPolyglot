// Supabase-backed ProfileService — GDPR recording consent (profiles.rec_consent) + deletion.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileService } from '../index';

export class SupabaseProfileService implements ProfileService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getRecConsent(): Promise<boolean> {
    const { data, error } = await this.client
      .from('profiles')
      .select('rec_consent')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) throw error;
    const row = data as { rec_consent: boolean } | null;
    return row?.rec_consent ?? false;
  }

  async setRecConsent(value: boolean): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ rec_consent: value, rec_consent_at: value ? new Date().toISOString() : null })
      .eq('id', this.userId);
    if (error) throw error;
  }

  async deleteRecordings(): Promise<void> {
    const { error } = await this.client.from('recordings').delete().eq('user_id', this.userId);
    if (error) throw error;
  }
}

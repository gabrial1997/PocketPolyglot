// Supabase-backed ProfileService — GDPR recording consent (profiles.rec_consent) + deletion.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileService, ProfileSnapshot } from '../index';

export class SupabaseProfileService implements ProfileService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  // Shared helper for GDPR audit timestamp — keeps setRecConsent and setConsent in sync.
  private recConsentAt(value: boolean): string | null {
    return value ? new Date().toISOString() : null;
  }

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
      .update({ rec_consent: value, rec_consent_at: this.recConsentAt(value) })
      .eq('id', this.userId);
    if (error) throw error;
  }

  async deleteRecordings(): Promise<void> {
    // GDPR deletion must cover the AUDIO OBJECTS, not just the rows: the voice data lives in the
    // private `recordings` storage bucket (paths like `${userId}/${id}.m4a`, kept in
    // recordings.storage_path). Read the paths, remove the objects, THEN delete the rows —
    // storage first, so a failed remove never leaves orphaned audio behind unreachable rows.
    const { data, error: readError } = await this.client
      .from('recordings')
      .select('storage_path')
      .eq('user_id', this.userId);
    if (readError) throw readError;

    const paths = ((data ?? []) as { storage_path: string | null }[])
      .map((row) => row.storage_path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (paths.length > 0) {
      const { error: removeError } = await this.client.storage.from('recordings').remove(paths);
      if (removeError) throw removeError;
    }

    const { error } = await this.client.from('recordings').delete().eq('user_id', this.userId);
    if (error) throw error;
  }

  // --- D1b: getProfile + ensureProfile ---

  async getProfile(): Promise<ProfileSnapshot | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('rec_consent, training_consent, settings')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { rec_consent: boolean; training_consent: boolean; settings: Record<string, unknown> | null };
    return {
      recConsent: row.rec_consent ?? false,
      trainingConsent: row.training_consent ?? false,
      seenDiacritics: row.settings?.seenDiacritics === true,
      seenConsent: row.settings?.seenConsent === true,
    };
  }

  async ensureProfile(): Promise<void> {
    // Insert only { id } so the DB defaults for settings, rec_consent, created_at stay intact.
    // Treat a unique-violation (23505) as success — the row already exists (e.g. from the trigger).
    const { error } = await this.client
      .from('profiles')
      .insert({ id: this.userId });
    if (error && (error as { code?: string }).code !== '23505') throw error;
  }

  // --- D2a: setSeenDiacritics (settings-merge, editor-safe) ---

  async setSeenDiacritics(): Promise<void> {
    // Read-modify-write is acceptable here: this is a single-user build with no concurrent
    // settings writers. This preserves all existing keys (esp. settings.editor — Module F gate).
    // NOTE: Module F race (jsonb_set) is a known pre-Module-F follow-up; migrate when Module F lands.
    const { data: readData, error: readError } = await this.client
      .from('profiles')
      .select('settings')
      .eq('id', this.userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!readData) {
      throw new Error('setSeenDiacritics: no profile row for user; call ensureProfile() first');
    }
    const current = (readData as { settings: Record<string, unknown> | null }).settings ?? {};
    const { error: writeError } = await this.client
      .from('profiles')
      .update({ settings: { ...current, seenDiacritics: true } })
      .eq('id', this.userId);
    if (writeError) throw writeError;
  }

  // --- Task 5: setSeenConsent (settings-merge, mirrors setSeenDiacritics) ---

  async setSeenConsent(): Promise<void> {
    // Same read-modify-write settings merge as setSeenDiacritics (single-user build; preserves
    // settings.editor and seenDiacritics).
    const { data: readData, error: readError } = await this.client
      .from('profiles')
      .select('settings')
      .eq('id', this.userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!readData) {
      throw new Error('setSeenConsent: no profile row for user; call ensureProfile() first');
    }
    const current = (readData as { settings: Record<string, unknown> | null }).settings ?? {};
    const { error: writeError } = await this.client
      .from('profiles')
      .update({ settings: { ...current, seenConsent: true } })
      .eq('id', this.userId);
    if (writeError) throw writeError;
  }

  // --- D3a: setConsent (rec + training + timestamp) ---

  async setConsent(input: { rec: boolean; training: boolean }): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({
        rec_consent: input.rec,
        rec_consent_at: this.recConsentAt(input.rec),
        training_consent: input.training,
      })
      .eq('id', this.userId);
    if (error) throw error;
  }

  // --- D4: deleteAccount (Apple-mandated in-app deletion) ---

  async deleteAccount(): Promise<void> {
    const { error } = await this.client.rpc('delete_account');
    if (error) throw error;
  }
}

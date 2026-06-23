// E2: Consent-gated uploader — store only. NEVER scores, NEVER touches score/score_payload.
//
// Behavioral contract:
//  - No upload, no insert without explicit GDPR consent.
//  - Uploads to the private `recordings` bucket (user RLS-scoped client — no service-role key).
//  - Inserts EXACTLY { id, user_id, storage_path, duration_ms, consent_at } into `recordings`.
//  - Returns the new recording_id on success; returns null on any error (never throws into submit).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecordingUploader {
  /**
   * Upload a recording take + insert a consent-gated `recordings` row.
   * Returns the new `recording_id`, or null when:
   *   - recording is falsy
   *   - consent is absent
   *   - upload or insert fails
   * Never throws — the session must still advance.
   */
  upload(recording: Blob | string, opts?: { durationMs?: number }): Promise<string | null>;
}

export class SupabaseRecordingUploader implements RecordingUploader {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly getConsent: () => Promise<boolean>,
  ) {}

  async upload(recording: Blob | string, opts?: { durationMs?: number }): Promise<string | null> {
    // Guard 1: nothing to upload.
    if (!recording) return null;

    // Guard 2: GDPR consent gate — no upload, no insert without consent.
    if (!(await this.getConsent())) return null;

    // Generate a stable id + storage path.
    const id: string = crypto.randomUUID();
    const storage_path = `${this.userId}/${id}.m4a`;

    // Resolve bytes: string URI → fetch; Blob → use directly.
    let blob: Blob;
    if (typeof recording === 'string') {
      blob = await fetch(recording).then(r => r.blob());
    } else {
      blob = recording;
    }

    // Upload to the private bucket.
    const { error: uploadError } = await this.client.storage
      .from('recordings')
      .upload(storage_path, blob, { contentType: 'audio/m4a', upsert: false });

    if (uploadError) {
      // Do not throw — the session must still advance.
      return null;
    }

    // Insert the recordings row — EXACTLY these 5 columns.
    // NEVER set score or score_payload (scope fence).
    const { error: insertError } = await this.client.from('recordings').insert({
      id,
      user_id: this.userId,
      storage_path,
      duration_ms: opts?.durationMs ?? null,
      consent_at: new Date().toISOString(),
    });

    if (insertError) {
      // Best-effort cleanup of the orphaned storage object; do not throw.
      await this.client.storage.from('recordings').remove([storage_path]);
      return null;
    }

    return id;
  }
}

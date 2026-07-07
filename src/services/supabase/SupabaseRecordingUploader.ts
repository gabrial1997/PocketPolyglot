// E2: Consent-gated uploader — store only. NEVER scores, NEVER touches score/score_payload.
//
// Behavioral contract:
//  - No upload, no insert without explicit GDPR consent.
//  - Uploads to the private `recordings` bucket (user RLS-scoped client — no service-role key).
//  - Inserts EXACTLY { id, user_id, storage_path, duration_ms, consent_at } into `recordings`.
//  - Returns the new recording_id on success; returns null on any error (never throws into submit).
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUuid } from '../uuid';

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

    // Top-level catch: any thrown rejection (e.g. fetch network error) returns null
    // so the session always advances — never throws into submit().
    try {
      // Generate a stable id + storage path.
      const id: string = randomUuid();
      const storage_path = `${this.userId}/${id}.m4a`;

      // Resolve upload bytes. React Native cannot reliably materialise a Blob from a
      // fetch(file://…) response (SupabaseBugReportService uploads decoded ArrayBuffer bytes
      // for the same reason), so the file-URI path reads the response as an ArrayBuffer and
      // uploads raw bytes. A real Blob (web callers) is uploaded directly.
      let body: Blob | ArrayBuffer;
      if (typeof recording === 'string') {
        body = await fetch(recording).then(r => r.arrayBuffer());
      } else {
        body = recording;
      }

      // Upload to the private bucket. NB: 'audio/mp4' is the registered MIME type for an
      // .m4a (MPEG-4 audio) container — 'audio/m4a' is not a real MIME type.
      const { error: uploadError } = await this.client.storage
        .from('recordings')
        .upload(storage_path, body, { contentType: 'audio/mp4', upsert: false });

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
    } catch {
      // Backstop for any thrown rejection (e.g. fetch network error, r.arrayBuffer() rejection).
      // Returns null so the session always advances.
      return null;
    }
  }
}

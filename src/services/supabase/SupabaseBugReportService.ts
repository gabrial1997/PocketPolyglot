// Beta tooling: store a tester's bug report. Screenshot upload is best-effort (text-only on failure);
// only an insert failure throws. User-scoped client only — never a service-role key (CLAUDE.md).
import type { SupabaseClient } from '@supabase/supabase-js';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import type { BugReportInput, BugReportService } from '../index';

export class SupabaseBugReportService implements BugReportService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async submit(input: BugReportInput): Promise<void> {
    let screenshot_path: string | null = null;

    if (input.screenshotBase64) {
      // Best-effort: a failed screenshot must NOT block the text report. We upload decoded bytes
      // (not a fetch(file://).blob(), which is unreliable in React Native).
      try {
        const id = crypto.randomUUID();
        const path = `${this.userId}/${id}.png`;
        const bytes = decodeBase64(input.screenshotBase64); // ArrayBuffer
        const { error } = await this.client.storage
          .from('bug-screenshots')
          .upload(path, bytes, { contentType: 'image/png', upsert: false });
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('[bug-report] screenshot upload error', error);
        } else {
          screenshot_path = path;
        }
      } catch (e) {
        screenshot_path = null;
        // eslint-disable-next-line no-console
        console.warn('[bug-report] screenshot upload threw', e);
      }
    }

    const { error } = await this.client.from('bug_reports').insert({
      user_id: this.userId,
      description: input.description,
      screen: input.screen ?? null,
      app_version: input.appVersion ?? null,
      platform: input.platform ?? null,
      os_version: input.osVersion ?? null,
      screenshot_path,
      extra: input.extra ?? {},
    });
    if (error) throw error;
  }
}

// Supabase-backed EditorService — founder gate (profiles.settings.editor) + content-edit invoke.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EditorService, ContentEditRequest } from '../index';
import { validateContentEdit } from '../contentEdit';

export class SupabaseEditorService implements EditorService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async isEditor(): Promise<boolean> {
    const { data, error } = await this.client
      .from('profiles')
      .select('settings')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) throw error;
    const row = data as { settings: { editor?: boolean } | null } | null;
    return row?.settings?.editor === true;
  }

  async edit(req: ContentEditRequest): Promise<void> {
    // Validate locally before any network call — throws fast on bad input.
    validateContentEdit(req);
    const { error } = await this.client.functions.invoke('content-edit', { body: req });
    if (error) throw error;
  }
}

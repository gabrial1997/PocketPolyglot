// Dev-only actions surfaced in the Settings Developer section. NOT part of the
// ServiceBundle: these are testing tools, not app services. resetProgress is safe to
// ship compiled (the RPC only ever deletes the caller's own rows) but is only ever
// reachable from the __DEV__ Settings section.
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearClockOffset } from './devClock';

/** Wipe the signed-in user's review history + schedule and return to real time. */
export async function resetProgress(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('reset_my_progress');
  if (error) throw error;
  await clearClockOffset();
}

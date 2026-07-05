// Dev-only time travel for testing day boundaries (daily caps, FSRS due dates).
// A whole-day offset added to the real clock, persisted across reloads. Injected into
// SupabaseSrsService as its `now` source in dev builds ONLY — production always runs
// real time (the offset never loads and devNow degenerates to new Date()).
//
// KNOWN CAVEAT (accepted, spec §4): review_log.created_at is stamped by Postgres with
// real time while due_at/introducedToday use the shifted clock — consistent enough for
// loop testing, but the offset is one-way (going backward strands items in the future).
// Reset progress (devTools) clears the offset as the escape hatch.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pp.dev.clockOffsetDays';
const DAY_MS = 86_400_000;

let offsetDays = 0;

export function getOffsetDays(): number {
  return offsetDays;
}

/** Restore the persisted offset (call once at service creation). No-op in production. */
export async function loadClockOffset(): Promise<number> {
  if (!__DEV__) return 0;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    offsetDays = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    offsetDays = 0;
  }
  return offsetDays;
}

/** Advance the simulated clock by one day. Returns the new offset. */
export async function skipDay(): Promise<number> {
  offsetDays += 1;
  try {
    await AsyncStorage.setItem(KEY, String(offsetDays));
  } catch {
    // persistence is best-effort; the in-memory offset still applies this launch
  }
  return offsetDays;
}

/** Back to real time (also called by devTools.resetProgress). */
export async function clearClockOffset(): Promise<void> {
  offsetDays = 0;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/** The dev clock: real now + offset. Real time when no offset (and always in prod). */
export function devNow(): Date {
  return new Date(Date.now() + (__DEV__ ? offsetDays : 0) * DAY_MS);
}

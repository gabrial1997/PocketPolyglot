// Pure "earned" computation for the phrase gate (spec 2026-07-23).
// A lemma is EARNED iff a correct word/hear|word/recall row exists in a different
// round than its (earliest) intro row — where "different round" means a different
// session_id, or a later calendar UTC day (covers legacy null-session rows and
// dev time travel). Monotonic: computed from append-only review_log, never shrinks.

export interface EarnedLogRow {
  item_id: string;
  card_kind: string;
  correct: boolean | null;
  session_id: string | null;
  created_at: string;
}

const RECOGNITION_KINDS = new Set(['word/hear', 'word/recall']);

function day(iso: string): string {
  return iso.slice(0, 10); // UTC calendar day; review_log timestamps are ISO/UTC
}

export function computeEarned(rows: EarnedLogRow[]): Set<string> {
  // earliest intro per lemma
  const introBy = new Map<string, EarnedLogRow>();
  for (const r of rows) {
    if (!r.card_kind.startsWith('word/learn')) continue;
    const prev = introBy.get(r.item_id);
    if (!prev || r.created_at < prev.created_at) introBy.set(r.item_id, r);
  }
  const earned = new Set<string>();
  for (const r of rows) {
    if (r.correct !== true || !RECOGNITION_KINDS.has(r.card_kind)) continue;
    const i = introBy.get(r.item_id);
    if (!i) { earned.add(r.item_id); continue; } // legacy: no intro row recorded
    const differentSession =
      r.session_id !== null && i.session_id !== null && r.session_id !== i.session_id;
    const laterDay = day(r.created_at) > day(i.created_at);
    if (differentSession || laterDay) earned.add(r.item_id);
  }
  return earned;
}

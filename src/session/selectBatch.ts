/**
 * selectBatch.ts
 * Pure batch-selection function for the PocketPolyglot core loop (Module B, Task B1).
 *
 * PURITY CONTRACT: Zero Supabase imports, zero Date/clock reads.
 * All pacing numbers come from ./pacing — no inline literals.
 */

import {
  DAY_ONE_NEW_CAP,
  STEADY_STATE_NEW_CAP,
  REVIEW_BUDGET,
  DUE_FLOOD_MULTIPLIER,
  RETENTION_GATE_THRESHOLD,
  I_PLUS_ONE_UNKNOWN_TOLERANCE,
  PHRASE_INTRO_CAP,
} from './pacing';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** A never-introduced content row, already ordered by utility_rank ASC. */
export interface Candidate {
  id: string;
  kind: 'word' | 'phrase' | 'pair';
  utilityRank: number;
  hasAudioEnvelope: boolean;       // !!audio?.envelope
  semanticField?: string | null;   // lemmas.semantic_field
  /** phrases only: component lemma ids (phrase_components.lemma_id). */
  componentLemmaIds?: string[];
  /** phrases only: the anchor (head) lemma id used for the "≥1 successful recall" check. */
  anchorLemmaId?: string;
  /** pair only: the lemma id this minimal-pair drill blocks adjacent to. */
  blocksLemmaId?: string;
}

/** A due review item already fetched from review_state (+ content), pre-mapped to a light shape. */
export interface DueRef {
  id: string;
  kind: 'word' | 'phrase' | 'pair';
  hasAudioEnvelope: boolean;
  hasImage: boolean; // !!media?.imageUrl
}

export interface SelectContext {
  accountAgeDays: number;
  introducedToday: number;
  dueToday: number;
  /** correct-rate over last RETENTION_WINDOW graded mature reviews; undefined => no throttle. */
  rollingRetention: number | undefined;
  /** lemma ids the user "knows" (known_lemmas view). */
  knownLemmaIds: Set<string>;
  /** lemma ids with ≥1 successful recall (review_log correct=true), for the i+1 anchor check. */
  recalledLemmaIds: Set<string>;
  /** semantic_fields already admitted today (persisted from earlier sessions, optional seed). */
  todaysSemanticFields: Set<string>;
}

export interface SelectResult {
  /** final ordered selection: interleave(due, new) with phoneme-block mini-sets contiguous. */
  order: Array<{ id: string; kind: 'word' | 'phrase' | 'pair' }>;
  due: DueRef[];            // all due (review-eligible) — never throttled
  admittedNew: Candidate[]; // candidates admitted this call, utility order
  newAllowance: number;
}

// ---------------------------------------------------------------------------
// Private types for interleave
// ---------------------------------------------------------------------------

/** Either a single new candidate, or a contiguous mini-set (lemma + its pair(s)). */
type NewUnit = Candidate | Candidate[];

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Round-robin interleave of due reviews and new-item units.
 * Phoneme-block mini-sets (arrays) are emitted contiguously as a unit.
 * Pattern: due, new-unit, due, new-unit, … then exhaust whichever list remains.
 */
function interleave(
  due: DueRef[],
  newUnits: NewUnit[],
): Array<{ id: string; kind: 'word' | 'phrase' | 'pair' }> {
  const order: Array<{ id: string; kind: 'word' | 'phrase' | 'pair' }> = [];
  let di = 0;
  let ni = 0;

  while (di < due.length || ni < newUnits.length) {
    if (di < due.length) {
      const d = due[di++] as DueRef;
      order.push({ id: d.id, kind: d.kind });
    }
    if (ni < newUnits.length) {
      const unit = newUnits[ni++] as NewUnit;
      if (Array.isArray(unit)) {
        for (const c of unit) {
          order.push({ id: c.id, kind: c.kind });
        }
      } else {
        order.push({ id: unit.id, kind: unit.kind });
      }
    }
  }

  return order;
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export function selectBatch(input: {
  due: DueRef[];
  candidates: Candidate[];
  ctx: SelectContext;
}): SelectResult {
  const { due: rawDue, candidates, ctx } = input;

  // -------------------------------------------------------------------------
  // Step 1: Review-eligibility filter.
  // Words and phrases are reviewable via their WRITTEN form (the cards show the word/phrase with a
  // silent play orb until audio is backfilled), so they stay eligible for review regardless of
  // audio — otherwise the ~majority of audio-less items never come back for review. Pairs
  // (perception drills) genuinely need the clip, so audio-less pairs are still dropped.
  // (The cards are unchanged — this only controls which due items are surfaced.)
  // Reviews are never throttled — all eligible ones are always returned.
  // -------------------------------------------------------------------------
  const due = rawDue.filter(d => (d.kind === 'pair' ? d.hasAudioEnvelope : true));

  // -------------------------------------------------------------------------
  // Step 2: New cap based on account age.
  // -------------------------------------------------------------------------
  let newCap: number =
    ctx.accountAgeDays < 1 ? DAY_ONE_NEW_CAP : STEADY_STATE_NEW_CAP;

  // -------------------------------------------------------------------------
  // Step 3: Due-flood gate.
  // If the queue is overwhelmingly large, stop introducing new items.
  // -------------------------------------------------------------------------
  const dueFloodGateFired = ctx.dueToday > DUE_FLOOD_MULTIPLIER * REVIEW_BUDGET;
  if (dueFloodGateFired) {
    newCap = 0;
  }

  // -------------------------------------------------------------------------
  // Step 4: Retention gate.
  // If defined and below threshold, halve newCap (floor). Never pauses fully.
  // undefined retention = no throttle.
  // -------------------------------------------------------------------------
  if (
    ctx.rollingRetention !== undefined &&
    ctx.rollingRetention < RETENTION_GATE_THRESHOLD
  ) {
    newCap = Math.floor(newCap / 2);
  }

  // -------------------------------------------------------------------------
  // Step 5: newAllowance — how many NEW items we can still introduce this session.
  // -------------------------------------------------------------------------
  const newAllowance = Math.max(0, newCap - ctx.introducedToday);

  // -------------------------------------------------------------------------
  // Step 6: Admit new items.
  // Pass 1 — WORDS in utilityRank order against newAllowance (the budget unit).
  // -------------------------------------------------------------------------
  const admittedFields = new Set<string>(ctx.todaysSemanticFields);
  const sorted = [...candidates].sort((a, b) => a.utilityRank - b.utilityRank);

  const admittedWords: Candidate[] = [];
  const admittedWordIds = new Set<string>();
  for (const candidate of sorted) {
    if (candidate.kind !== 'word') continue;
    if (admittedWords.length >= newAllowance) break;
    if (candidate.semanticField && admittedFields.has(candidate.semanticField)) continue;
    admittedWords.push(candidate);
    admittedWordIds.add(candidate.id);
    if (candidate.semanticField) admittedFields.add(candidate.semanticField);
  }

  // -------------------------------------------------------------------------
  // Pass 2 — PHRASES: building blocks. Admissible iff the anchor has been
  // recalled AND either (a) zero unknown components (fully known), or (b)
  // exactly one unknown component whose word is admitted THIS batch (pass 1).
  // Capped at PHRASE_INTRO_CAP; phrases do NOT consume newAllowance.
  //
  // Skipped entirely when the due-flood gate fired: the gate's purpose is to
  // fully stop new admissions while the review queue is overwhelmed, and
  // fully-known phrases don't consume newAllowance so they would otherwise
  // keep entering (and re-entering on every same-day reopen) despite the
  // gate. A merely-spent daily allowance (newAllowance === 0, gate not fired)
  // still runs this pass — a fully-known phrase's building-block unlock is
  // meant to land the same day its last component word does.
  // -------------------------------------------------------------------------
  const fullyKnownPhrases: Candidate[] = [];
  const oneAwayByWordId = new Map<string, Candidate[]>();
  let phrasesAdmitted = 0;
  if (!dueFloodGateFired) {
    for (const candidate of sorted) {
      if (candidate.kind !== 'phrase') continue;
      if (phrasesAdmitted >= PHRASE_INTRO_CAP) break;
      if (!candidate.anchorLemmaId || !ctx.recalledLemmaIds.has(candidate.anchorLemmaId)) {
        continue;
      }
      const unknown = (candidate.componentLemmaIds ?? []).filter(
        (id) => !ctx.knownLemmaIds.has(id),
      );
      if (unknown.length === 0) {
        fullyKnownPhrases.push(candidate);
        phrasesAdmitted++;
      } else if (
        unknown.length <= I_PLUS_ONE_UNKNOWN_TOLERANCE &&
        unknown[0] !== undefined &&
        admittedWordIds.has(unknown[0])
      ) {
        const arr = oneAwayByWordId.get(unknown[0]) ?? [];
        arr.push(candidate);
        oneAwayByWordId.set(unknown[0], arr);
        phrasesAdmitted++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3 — PAIRS (unchanged rules): audio-gated; embedded after their blocked
  // lemma when it was admitted, otherwise standalone (orphaned).
  // -------------------------------------------------------------------------
  const pairsByBlockedLemma = new Map<string, Candidate[]>();
  const orphanedPairs: Candidate[] = [];
  for (const candidate of sorted) {
    if (candidate.kind !== 'pair') continue;
    if (!candidate.hasAudioEnvelope) continue;
    if (candidate.blocksLemmaId && admittedWordIds.has(candidate.blocksLemmaId)) {
      const arr = pairsByBlockedLemma.get(candidate.blocksLemmaId) ?? [];
      arr.push(candidate);
      pairsByBlockedLemma.set(candidate.blocksLemmaId, arr);
    } else {
      orphanedPairs.push(candidate);
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Assemble units and the final admittedNew list.
  // Unit shape per word: [one-away teaser phrase(s)…, word, pair(s)…] — the
  // teaser precedes its word (locked → learn → chime), pairs follow it.
  // Fully-known phrases follow all word units; orphaned pairs go last.
  // -------------------------------------------------------------------------
  const newUnits: NewUnit[] = [];
  const admittedNew: Candidate[] = [];
  for (const w of admittedWords) {
    const teasers = oneAwayByWordId.get(w.id) ?? [];
    const pairs = pairsByBlockedLemma.get(w.id) ?? [];
    const unit = [...teasers, w, ...pairs];
    newUnits.push(unit.length === 1 ? w : unit);
    admittedNew.push(...unit);
  }
  for (const p of fullyKnownPhrases) {
    newUnits.push(p);
    admittedNew.push(p);
  }
  for (const p of orphanedPairs) {
    newUnits.push(p);
    admittedNew.push(p);
  }

  const order = interleave(due, newUnits);

  return { order, due, admittedNew, newAllowance };
}

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
  // Keep every due ref where hasAudioEnvelope || hasImage.
  // Audio-less + image-less due items are dropped (not re-surfaced until backfilled).
  // Reviews are never throttled — all eligible ones are always returned.
  // -------------------------------------------------------------------------
  const due = rawDue.filter(d => d.hasAudioEnvelope || d.hasImage);

  // -------------------------------------------------------------------------
  // Step 2: New cap based on account age.
  // -------------------------------------------------------------------------
  let newCap: number =
    ctx.accountAgeDays < 1 ? DAY_ONE_NEW_CAP : STEADY_STATE_NEW_CAP;

  // -------------------------------------------------------------------------
  // Step 3: Due-flood gate.
  // If the queue is overwhelmingly large, stop introducing new items.
  // -------------------------------------------------------------------------
  if (ctx.dueToday > DUE_FLOOD_MULTIPLIER * REVIEW_BUDGET) {
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
  // Step 6: Admit candidates in utilityRank order, applying gates A–C.
  // Phoneme-block mini-sets (D) are tracked for step 7.
  // -------------------------------------------------------------------------
  const admittedNew: Candidate[] = [];
  // Mutable copy so we don't mutate caller's Set
  const admittedFields = new Set<string>(ctx.todaysSemanticFields);

  // Sort defensively (spec says pre-sorted, but defend anyway)
  const sorted = [...candidates].sort((a, b) => a.utilityRank - b.utilityRank);

  for (const candidate of sorted) {
    if (admittedNew.length >= newAllowance) break;

    // ------------------------------------------------------------------
    // Gate (a): Audio gate
    // word → always eligible (audio-less OK)
    // phrase → require hasAudioEnvelope
    // pair  → require hasAudioEnvelope
    // ------------------------------------------------------------------
    if (
      (candidate.kind === 'phrase' || candidate.kind === 'pair') &&
      !candidate.hasAudioEnvelope
    ) {
      continue;
    }

    // ------------------------------------------------------------------
    // Gate (b): i+1 phrase gate (phrases only)
    // ------------------------------------------------------------------
    if (candidate.kind === 'phrase') {
      const componentIds = candidate.componentLemmaIds ?? [];
      const unknown = componentIds.filter(
        id => !ctx.knownLemmaIds.has(id),
      ).length;
      if (unknown > I_PLUS_ONE_UNKNOWN_TOLERANCE) {
        continue;
      }
      // Anchor must have been recalled at least once
      if (
        !candidate.anchorLemmaId ||
        !ctx.recalledLemmaIds.has(candidate.anchorLemmaId)
      ) {
        continue;
      }
    }

    // ------------------------------------------------------------------
    // Gate (c): Semantic-cluster exclusion
    // ------------------------------------------------------------------
    if (candidate.semanticField && admittedFields.has(candidate.semanticField)) {
      continue;
    }

    // ------------------------------------------------------------------
    // Admit the candidate
    // ------------------------------------------------------------------
    admittedNew.push(candidate);
    if (candidate.semanticField) {
      admittedFields.add(candidate.semanticField);
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Assemble final order via interleave, keeping phoneme-block
  // mini-sets (pair + its blocked lemma) contiguous.
  //
  // Strategy:
  //   - Build a map: blocksLemmaId → admitted pair(s) that block it.
  //   - Walk admittedNew in order. When we encounter a lemma that is blocked
  //     by an admitted pair, emit [lemma, ...pairs] as a contiguous mini-set.
  //   - Skip pairs when encountered standalone (they've already been emitted
  //     as part of their lemma's mini-set).
  // -------------------------------------------------------------------------

  // Build: lemmaId → pairs that block it (in admission order)
  const pairsByBlockedLemma = new Map<string, Candidate[]>();
  for (const c of admittedNew) {
    if (c.kind === 'pair' && c.blocksLemmaId) {
      const existing = pairsByBlockedLemma.get(c.blocksLemmaId) ?? [];
      existing.push(c);
      pairsByBlockedLemma.set(c.blocksLemmaId, existing);
    }
  }

  // Set of pair ids that have been embedded into a mini-set (to skip standalone)
  const embeddedPairIds = new Set<string>();
  if (pairsByBlockedLemma.size > 0) {
    for (const pairs of pairsByBlockedLemma.values()) {
      for (const p of pairs) {
        embeddedPairIds.add(p.id);
      }
    }
  }

  const newUnits: NewUnit[] = [];
  for (const candidate of admittedNew) {
    if (embeddedPairIds.has(candidate.id)) {
      // This pair is emitted as part of its blocked lemma's mini-set — skip here
      continue;
    }
    const blockedByPairs = pairsByBlockedLemma.get(candidate.id);
    if (blockedByPairs && blockedByPairs.length > 0) {
      // Emit lemma + its pairs as a contiguous mini-set
      newUnits.push([candidate, ...blockedByPairs]);
    } else {
      newUnits.push(candidate);
    }
  }

  const order = interleave(due, newUnits);

  return { order, due, admittedNew, newAllowance };
}

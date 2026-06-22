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

  // Count of admitted non-pair candidates (words/phrases = the budgeted "units").
  // Pairs are part of a lemma's mini-set and do NOT consume a newAllowance slot.
  let admittedNonPairCount = 0;

  // Track admitted non-pair ids so we can sweep for associated pairs afterward.
  const admittedNonPairIds = new Set<string>();

  for (const candidate of sorted) {
    if (candidate.kind === 'pair') {
      // Pairs are handled in a second pass below — skip during the main loop.
      continue;
    }

    if (admittedNonPairCount >= newAllowance) break;

    // ------------------------------------------------------------------
    // Gate (a): Audio gate (phrases only — words always eligible)
    // ------------------------------------------------------------------
    if (candidate.kind === 'phrase' && !candidate.hasAudioEnvelope) {
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
    // Admit the word/phrase
    // ------------------------------------------------------------------
    admittedNew.push(candidate);
    admittedNonPairIds.add(candidate.id);
    if (candidate.semanticField) {
      admittedFields.add(candidate.semanticField);
    }
    admittedNonPairCount++;
  }

  // Second pass: admit pairs whose blocksLemmaId is among the admitted non-pairs
  // (or among due refs — orphaned pairs). Pairs go through the audio gate only.
  // They are inserted into admittedNew after their blocked lemma (if present),
  // or appended. We collect them in a separate list first and splice in order.
  //
  // Strategy: iterate sorted in order; for each pair, if it passes the audio gate
  // and its blocksLemmaId is in admittedNonPairIds, admit it. We also admit
  // "orphaned" pairs — pairs whose blocksLemmaId is NOT in admittedNonPairIds
  // (e.g. the blocked lemma is a review item). Orphaned pairs still require audio
  // and still count as admittedNew (but not against newAllowance).
  const pairsToEmbed: Candidate[] = [];
  const orphanedPairs: Candidate[] = [];

  for (const candidate of sorted) {
    if (candidate.kind !== 'pair') continue;
    // Audio gate for pairs
    if (!candidate.hasAudioEnvelope) continue;

    if (candidate.blocksLemmaId && admittedNonPairIds.has(candidate.blocksLemmaId)) {
      pairsToEmbed.push(candidate);
    }
    // Orphaned pairs (blocksLemmaId not in admittedNonPairIds) are admitted only
    // if they were explicitly passed as a candidate — they are part of the lesson
    // design (e.g. the drilled lemma is a review item). We admit them standalone.
    // NOTE: We do NOT auto-admit pairs for review items by default; pairs reach
    // the candidate list because the caller explicitly included them.
    // Since the caller passed them, we admit them:
    else {
      orphanedPairs.push(candidate);
    }
  }

  // Insert embedded pairs right after their blocked lemma in admittedNew
  // (maintains the original utility order of non-pairs).
  const pairsByBlockedLemmaForEmbed = new Map<string, Candidate[]>();
  for (const p of pairsToEmbed) {
    const key = p.blocksLemmaId as string;
    const arr = pairsByBlockedLemmaForEmbed.get(key) ?? [];
    arr.push(p);
    pairsByBlockedLemmaForEmbed.set(key, arr);
  }

  // Rebuild admittedNew with embedded pairs inserted after their blocked lemma,
  // followed by orphaned pairs appended at the end.
  const admittedNewWithPairs: Candidate[] = [];
  for (const c of admittedNew) {
    admittedNewWithPairs.push(c);
    const embeddablePairs = pairsByBlockedLemmaForEmbed.get(c.id);
    if (embeddablePairs) {
      admittedNewWithPairs.push(...embeddablePairs);
    }
  }
  admittedNewWithPairs.push(...orphanedPairs);

  // Replace admittedNew contents
  admittedNew.length = 0;
  admittedNew.push(...admittedNewWithPairs);

  // -------------------------------------------------------------------------
  // Step 7: Assemble final order via interleave, keeping phoneme-block
  // mini-sets (pair + its blocked lemma) contiguous.
  //
  // After Step 6, admittedNew already has pairs inserted immediately after their
  // blocked lemma (or appended as orphans). We just need to group each lemma with
  // its immediately following pair(s) into a NewUnit array for interleave.
  // -------------------------------------------------------------------------

  const newUnits: NewUnit[] = [];
  let i = 0;
  while (i < admittedNew.length) {
    const candidate = admittedNew[i] as Candidate;
    if (candidate.kind !== 'pair') {
      // Collect any immediately following pairs that block this lemma
      const miniSet: Candidate[] = [candidate];
      let j = i + 1;
      while (
        j < admittedNew.length &&
        (admittedNew[j] as Candidate).kind === 'pair' &&
        (admittedNew[j] as Candidate).blocksLemmaId === candidate.id
      ) {
        miniSet.push(admittedNew[j] as Candidate);
        j++;
      }
      newUnits.push(miniSet.length === 1 ? miniSet[0] as Candidate : miniSet);
      i = j;
    } else {
      // Orphaned pair (or pair whose blocked lemma is not adjacent): emit standalone
      newUnits.push(candidate);
      i++;
    }
  }

  const order = interleave(due, newUnits);

  return { order, due, admittedNew, newAllowance };
}

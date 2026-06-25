/**
 * selectBatch.test.ts
 * TDD suite for the pure selectBatch selection function (Module B, Task B1).
 * All fixtures are hand-built — no Supabase, no clock reads.
 */

import {
  selectBatch,
  Candidate,
  DueRef,
  SelectContext,
} from './selectBatch';
import {
  DAY_ONE_NEW_CAP,
  STEADY_STATE_NEW_CAP,
  REVIEW_BUDGET,
  DUE_FLOOD_MULTIPLIER,
  RETENTION_GATE_THRESHOLD,
  I_PLUS_ONE_UNKNOWN_TOLERANCE,
} from './pacing';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeWord(
  id: string,
  utilityRank: number,
  overrides: Partial<Candidate> = {},
): Candidate {
  return {
    id,
    kind: 'word',
    utilityRank,
    hasAudioEnvelope: true,
    semanticField: null,
    ...overrides,
  };
}

function makePhrase(
  id: string,
  utilityRank: number,
  overrides: Partial<Candidate> = {},
): Candidate {
  return {
    id,
    kind: 'phrase',
    utilityRank,
    hasAudioEnvelope: true,
    componentLemmaIds: [],
    anchorLemmaId: 'anchor1',
    ...overrides,
  };
}

function makePair(
  id: string,
  utilityRank: number,
  overrides: Partial<Candidate> = {},
): Candidate {
  return {
    id,
    kind: 'pair',
    utilityRank,
    hasAudioEnvelope: true,
    blocksLemmaId: 'lemma-pair-target',
    ...overrides,
  };
}

function makeDueRef(
  id: string,
  overrides: Partial<DueRef> = {},
): DueRef {
  return {
    id,
    kind: 'word',
    hasAudioEnvelope: true,
    hasImage: false,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<SelectContext> = {}): SelectContext {
  return {
    accountAgeDays: 2,
    introducedToday: 0,
    dueToday: 0,
    rollingRetention: undefined,
    knownLemmaIds: new Set(),
    recalledLemmaIds: new Set(),
    todaysSemanticFields: new Set(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectBatch', () => {
  // -------------------------------------------------------------------------
  // 1. Flood of due → all review-eligible due returned, newAllowance === 0,
  //    admittedNew empty.
  // -------------------------------------------------------------------------
  describe('due-flood gate: collapses newCap to 0 when dueToday is very large', () => {
    it('returns all review-eligible due items, newAllowance 0, admittedNew empty', () => {
      const dueToday = DUE_FLOOD_MULTIPLIER * REVIEW_BUDGET + 1; // just above threshold
      const due: DueRef[] = Array.from({ length: 5 }, (_, i) =>
        makeDueRef(`due-${i}`, { hasAudioEnvelope: true, hasImage: false }),
      );
      // candidates available
      const candidates: Candidate[] = [makeWord('w1', 1)];
      const ctx = baseCtx({ dueToday });

      const result = selectBatch({ due, candidates, ctx });

      expect(result.newAllowance).toBe(0);
      expect(result.admittedNew).toHaveLength(0);
      expect(result.due).toHaveLength(5);
      // order should contain exactly the due items
      expect(result.order.map(o => o.id)).toEqual(
        result.due.map(d => d.id),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Day-1 (accountAgeDays: 0, introducedToday: 0) → admittedNew.length <= 20
  // -------------------------------------------------------------------------
  describe('Day-1 new cap', () => {
    it(`admits up to ${DAY_ONE_NEW_CAP} new items on day 1`, () => {
      const candidates: Candidate[] = Array.from({ length: 30 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );
      const ctx = baseCtx({ accountAgeDays: 0, introducedToday: 0 });

      const result = selectBatch({ due: [], candidates, ctx });

      expect(result.admittedNew.length).toBeLessThanOrEqual(DAY_ONE_NEW_CAP);
      expect(result.newAllowance).toBe(DAY_ONE_NEW_CAP); // none introduced yet
    });
  });

  // -------------------------------------------------------------------------
  // 3. Day-2 (accountAgeDays: 1, introducedToday: 0) → admittedNew.length <= 5
  // -------------------------------------------------------------------------
  describe('Day-2+ steady-state new cap', () => {
    it(`admits up to ${STEADY_STATE_NEW_CAP} new items from day 2 onward`, () => {
      const candidates: Candidate[] = Array.from({ length: 20 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );
      const ctx = baseCtx({ accountAgeDays: 1, introducedToday: 0 });

      const result = selectBatch({ due: [], candidates, ctx });

      expect(result.admittedNew.length).toBeLessThanOrEqual(STEADY_STATE_NEW_CAP);
      expect(result.newAllowance).toBe(STEADY_STATE_NEW_CAP);
    });
  });

  // -------------------------------------------------------------------------
  // 4. dueToday > 2 * REVIEW_BUDGET → newCap collapses, admittedNew empty.
  //    (Overlaps with test 1 but this one uses exact threshold arithmetic.)
  // -------------------------------------------------------------------------
  describe('due-flood gate: exact threshold', () => {
    it('collapses newCap to 0 when dueToday exceeds DUE_FLOOD_MULTIPLIER * REVIEW_BUDGET', () => {
      const ctx = baseCtx({
        dueToday: DUE_FLOOD_MULTIPLIER * REVIEW_BUDGET + 1,
        accountAgeDays: 0, // day 1, would otherwise get 20
        introducedToday: 0,
      });
      const candidates: Candidate[] = Array.from({ length: 5 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );

      const result = selectBatch({ due: [], candidates, ctx });

      expect(result.newAllowance).toBe(0);
      expect(result.admittedNew).toHaveLength(0);
    });

    it('does NOT collapse newCap when dueToday exactly equals the threshold', () => {
      // boundary is strictly greater than — at exactly 2*REVIEW_BUDGET it should NOT collapse
      const ctx = baseCtx({
        dueToday: DUE_FLOOD_MULTIPLIER * REVIEW_BUDGET, // exact, NOT over
        accountAgeDays: 1,
        introducedToday: 0,
      });
      const candidates: Candidate[] = Array.from({ length: 10 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );

      const result = selectBatch({ due: [], candidates, ctx });

      // newCap should still be STEADY_STATE_NEW_CAP
      expect(result.newAllowance).toBe(STEADY_STATE_NEW_CAP);
    });
  });

  // -------------------------------------------------------------------------
  // 5. rollingRetention < 0.85 → new halved (Day-1 cap 20 → ≤10; exact floor).
  // -------------------------------------------------------------------------
  describe('retention gate', () => {
    it(`halves newCap when rollingRetention < ${RETENTION_GATE_THRESHOLD}`, () => {
      const ctx = baseCtx({
        accountAgeDays: 0,
        introducedToday: 0,
        rollingRetention: RETENTION_GATE_THRESHOLD - 0.01, // just below threshold
      });
      const candidates: Candidate[] = Array.from({ length: 30 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );

      const result = selectBatch({ due: [], candidates, ctx });

      // DAY_ONE_NEW_CAP = 20 → floor(20/2) = 10
      const expectedCap = Math.floor(DAY_ONE_NEW_CAP / 2);
      expect(result.newAllowance).toBe(expectedCap);
      // Exact: with 30 gate-passing candidates the function must fill the whole cap
      expect(result.admittedNew.length).toBe(expectedCap);
    });

    it('uses exact Math.floor when halving (e.g. odd cap)', () => {
      // Steady-state cap is 5 → floor(5/2) = 2
      const ctx = baseCtx({
        accountAgeDays: 1,
        introducedToday: 0,
        rollingRetention: RETENTION_GATE_THRESHOLD - 0.01,
      });
      const candidates: Candidate[] = Array.from({ length: 10 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );

      const result = selectBatch({ due: [], candidates, ctx });

      const expectedCap = Math.floor(STEADY_STATE_NEW_CAP / 2);
      expect(result.newAllowance).toBe(expectedCap);
    });
  });

  // -------------------------------------------------------------------------
  // 6. rollingRetention === undefined → NO throttle (full cap).
  // -------------------------------------------------------------------------
  describe('undefined rollingRetention → no throttle', () => {
    it('applies full cap when rollingRetention is undefined', () => {
      const ctx = baseCtx({
        accountAgeDays: 1,
        introducedToday: 0,
        rollingRetention: undefined,
      });
      const candidates: Candidate[] = Array.from({ length: 10 }, (_, i) =>
        makeWord(`w${i}`, i + 1),
      );

      const result = selectBatch({ due: [], candidates, ctx });

      expect(result.newAllowance).toBe(STEADY_STATE_NEW_CAP);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Candidates emitted in utilityRank order.
  // -------------------------------------------------------------------------
  describe('utilityRank ordering', () => {
    it('admits candidates in ascending utilityRank order', () => {
      // Provide candidates in shuffled rank order; expect admitted to be ascending
      const candidates: Candidate[] = [
        makeWord('w5', 5),
        makeWord('w2', 2),
        makeWord('w4', 4),
        makeWord('w1', 1),
        makeWord('w3', 3),
      ];
      const ctx = baseCtx({
        accountAgeDays: 1,
        introducedToday: 0,
        rollingRetention: undefined,
      });

      const result = selectBatch({ due: [], candidates, ctx });

      const ranks = result.admittedNew.map(c => c.utilityRank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
  });

  // -------------------------------------------------------------------------
  // 8. i+1 gate
  // -------------------------------------------------------------------------
  describe('i+1 phrase gate', () => {
    it(`rejects a phrase with more than ${I_PLUS_ONE_UNKNOWN_TOLERANCE} unknown components`, () => {
      const knownLemmaIds = new Set(['lemma-A']);
      const recalledLemmaIds = new Set(['anchor1']);
      const ctx = baseCtx({ knownLemmaIds, recalledLemmaIds });

      const twoUnknown = makePhrase('p1', 1, {
        componentLemmaIds: ['lemma-A', 'lemma-B', 'lemma-C'], // B and C unknown
        anchorLemmaId: 'anchor1',
      });

      const result = selectBatch({ due: [], candidates: [twoUnknown], ctx });

      expect(result.admittedNew).toHaveLength(0);
    });

    it('admits a phrase with 1 unknown component whose anchor has been recalled', () => {
      const knownLemmaIds = new Set(['lemma-A', 'lemma-B']);
      const recalledLemmaIds = new Set(['anchor1']);
      const ctx = baseCtx({ knownLemmaIds, recalledLemmaIds });

      const oneUnknown = makePhrase('p1', 1, {
        componentLemmaIds: ['lemma-A', 'lemma-B', 'lemma-C'], // only C unknown
        anchorLemmaId: 'anchor1',
      });

      const result = selectBatch({ due: [], candidates: [oneUnknown], ctx });

      expect(result.admittedNew).toHaveLength(1);
      expect(result.admittedNew[0]?.id).toBe('p1');
    });

    it('rejects a phrase whose anchor lemma has no successful recall', () => {
      const knownLemmaIds = new Set(['lemma-A', 'lemma-B']);
      // recalledLemmaIds does NOT contain anchorLemmaId
      const recalledLemmaIds = new Set<string>();
      const ctx = baseCtx({ knownLemmaIds, recalledLemmaIds });

      const phraseWithUnrecalledAnchor = makePhrase('p1', 1, {
        componentLemmaIds: ['lemma-A', 'lemma-B', 'lemma-C'], // C unknown
        anchorLemmaId: 'anchor1',
      });

      const result = selectBatch({
        due: [],
        candidates: [phraseWithUnrecalledAnchor],
        ctx,
      });

      expect(result.admittedNew).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Semantic-cluster exclusion
  // -------------------------------------------------------------------------
  describe('semantic-cluster exclusion', () => {
    it('rejects a 2nd candidate with the same semanticField admitted today', () => {
      const ctx = baseCtx({
        accountAgeDays: 1,
        introducedToday: 0,
        todaysSemanticFields: new Set(), // no pre-seeded fields
      });

      const candidates: Candidate[] = [
        makeWord('w1', 1, { semanticField: 'food' }),
        makeWord('w2', 2, { semanticField: 'food' }), // same field — should be rejected
        makeWord('w3', 3, { semanticField: 'transport' }),
      ];

      const result = selectBatch({ due: [], candidates, ctx });

      const ids = result.admittedNew.map(c => c.id);
      expect(ids).toContain('w1');
      expect(ids).not.toContain('w2'); // rejected by semantic-cluster gate
      expect(ids).toContain('w3');
    });

    it('respects pre-seeded todaysSemanticFields from earlier sessions', () => {
      const ctx = baseCtx({
        accountAgeDays: 1,
        introducedToday: 0,
        todaysSemanticFields: new Set(['food']), // already admitted today
      });

      const candidates: Candidate[] = [
        makeWord('w1', 1, { semanticField: 'food' }), // pre-seeded field — reject
        makeWord('w2', 2, { semanticField: 'transport' }),
      ];

      const result = selectBatch({ due: [], candidates, ctx });

      const ids = result.admittedNew.map(c => c.id);
      expect(ids).not.toContain('w1');
      expect(ids).toContain('w2');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Audio gate
  // -------------------------------------------------------------------------
  describe('audio gate', () => {
    it('DOES admit an audio-less phrase whose anchor is recalled and components are known', () => {
      // Phrase audio gate removed: audio-less phrases are now admitted so they can flow
      // through the loop via phrase/hear (exposure card — audio-optional).
      const ctx = baseCtx({
        accountAgeDays: 1,
        introducedToday: 0,
        recalledLemmaIds: new Set(['anchor1']),
        knownLemmaIds: new Set(['lemma-A']),
      });

      const audiolessPhrase = makePhrase('p1', 1, {
        hasAudioEnvelope: false,
        componentLemmaIds: ['lemma-A'], // 0 unknown
        anchorLemmaId: 'anchor1',
      });

      const result = selectBatch({ due: [], candidates: [audiolessPhrase], ctx });

      expect(result.admittedNew).toHaveLength(1);
      expect(result.admittedNew[0]?.id).toBe('p1');
    });

    it('admits an audio-less phrase whose anchor is recalled and components are known', () => {
      // Mirror of the "admits a phrase" i+1 test but with hasAudioEnvelope:false.
      const knownLemmaIds = new Set(['lemma-A', 'lemma-B']);
      const recalledLemmaIds = new Set(['anchor1']);
      const ctx = baseCtx({ knownLemmaIds, recalledLemmaIds });

      const audiolessPhrase = makePhrase('p1', 1, {
        hasAudioEnvelope: false,
        componentLemmaIds: ['lemma-A', 'lemma-B', 'lemma-C'], // only C unknown (≤ tolerance)
        anchorLemmaId: 'anchor1',
      });

      const result = selectBatch({ due: [], candidates: [audiolessPhrase], ctx });

      expect(result.admittedNew).toHaveLength(1);
      expect(result.admittedNew[0]?.id).toBe('p1');
    });

    it('DOES admit an audio-less word', () => {
      const ctx = baseCtx({ accountAgeDays: 1, introducedToday: 0 });
      const audiolessWord = makeWord('w1', 1, { hasAudioEnvelope: false });

      const result = selectBatch({ due: [], candidates: [audiolessWord], ctx });

      expect(result.admittedNew).toHaveLength(1);
      expect(result.admittedNew[0]?.id).toBe('w1');
    });

    it('does NOT admit an audio-less pair', () => {
      const ctx = baseCtx({ accountAgeDays: 1, introducedToday: 0 });
      const audiolessPair = makePair('pair1', 1, {
        hasAudioEnvelope: false,
        blocksLemmaId: 'w1',
      });

      const result = selectBatch({ due: [], candidates: [audiolessPair], ctx });

      expect(result.admittedNew).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Phoneme-block mini-set stays contiguous after interleave
  // -------------------------------------------------------------------------
  describe('phoneme-block mini-set contiguity', () => {
    it('keeps a lemma and its admitted minimal-pair drill adjacent in the final order', () => {
      const ctx = baseCtx({
        accountAgeDays: 0, // day 1, cap 20
        introducedToday: 0,
      });

      // Three regular words + one pair that blocks 'lemma-block-target'
      const blockTarget = makeWord('lemma-block-target', 2);
      const candidates: Candidate[] = [
        makeWord('w1', 1),
        blockTarget,
        makeWord('w3', 3),
        makePair('pair-drill', 4, {
          blocksLemmaId: 'lemma-block-target',
          hasAudioEnvelope: true,
        }),
        makeWord('w5', 5),
      ];

      const due: DueRef[] = [
        makeDueRef('due1'),
        makeDueRef('due2'),
        makeDueRef('due3'),
      ];

      const result = selectBatch({ due, candidates, ctx });

      const ids = result.order.map(o => o.id);

      // lemma-block-target and pair-drill must be adjacent
      const targetIdx = ids.indexOf('lemma-block-target');
      const pairIdx = ids.indexOf('pair-drill');

      expect(targetIdx).toBeGreaterThanOrEqual(0);
      expect(pairIdx).toBeGreaterThanOrEqual(0);
      expect(Math.abs(targetIdx - pairIdx)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Review-eligibility filter
  // -------------------------------------------------------------------------
  describe('review-eligibility filter', () => {
    it('drops a due ref that has neither audio envelope nor image', () => {
      const audioImagelessDue = makeDueRef('dropped', {
        hasAudioEnvelope: false,
        hasImage: false,
      });
      const ctx = baseCtx();

      const result = selectBatch({ due: [audioImagelessDue], candidates: [], ctx });

      expect(result.due).toHaveLength(0);
      expect(result.order.find(o => o.id === 'dropped')).toBeUndefined();
    });

    it('keeps an image-only due ref (no audio envelope)', () => {
      const imageOnlyDue = makeDueRef('kept', {
        hasAudioEnvelope: false,
        hasImage: true,
      });
      const ctx = baseCtx();

      const result = selectBatch({ due: [imageOnlyDue], candidates: [], ctx });

      expect(result.due).toHaveLength(1);
      expect(result.due[0]?.id).toBe('kept');
    });

    it('keeps an audio-only due ref (no image)', () => {
      const audioOnlyDue = makeDueRef('kept2', {
        hasAudioEnvelope: true,
        hasImage: false,
      });
      const ctx = baseCtx();

      const result = selectBatch({ due: [audioOnlyDue], candidates: [], ctx });

      expect(result.due).toHaveLength(1);
      expect(result.due[0]?.id).toBe('kept2');
    });
  });

  // -------------------------------------------------------------------------
  // 13. interleave: general round-robin
  // -------------------------------------------------------------------------
  describe('interleave round-robin', () => {
    it('alternates due and new items in the final order', () => {
      const due: DueRef[] = [makeDueRef('d1'), makeDueRef('d2')];
      const candidates: Candidate[] = [
        makeWord('w1', 1),
        makeWord('w2', 2),
        makeWord('w3', 3),
      ];
      const ctx = baseCtx({ accountAgeDays: 1, introducedToday: 0 });

      const result = selectBatch({ due, candidates, ctx });

      // With 2 due + 3 new (cap is 5, so all 3 new admitted), order is:
      // due, new, due, new, new  (due exhausted after 2)
      const dueIds = new Set(result.due.map(d => d.id));
      const kinds = result.order.map(o => (dueIds.has(o.id) ? 'due' : 'new'));

      expect(kinds).toEqual(['due', 'new', 'due', 'new', 'new']);
    });
  });

  // -------------------------------------------------------------------------
  // 14. Orphaned pair (blocksLemmaId not in admittedNew) must appear in order
  // -------------------------------------------------------------------------
  describe('orphaned pair still appears in order', () => {
    it('includes an orphaned pair in order even when its blocksLemmaId is not a new candidate', () => {
      // The pair's target lemma is a review item (in due), not a new candidate.
      // The pair must still appear in order — standalone — and not be silently dropped.
      const ctx = baseCtx({ accountAgeDays: 1, introducedToday: 0 });

      const orphanPair = makePair('pair-orphan', 1, {
        hasAudioEnvelope: true,
        blocksLemmaId: 'review-lemma', // this id is only in due, not in candidates
      });
      const due: DueRef[] = [makeDueRef('review-lemma')];
      const candidates: Candidate[] = [orphanPair];

      const result = selectBatch({ due, candidates, ctx });

      const orderIds = result.order.map(o => o.id);
      // Pair must appear in order
      expect(orderIds).toContain('pair-orphan');

      // Set-equality invariant: order ids == eligible-due ids + admittedNew ids (no drop, no dupe)
      const eligibleDueIds = result.due.map(d => d.id);
      const admittedNewIds = result.admittedNew.map(c => c.id);
      const expectedIds = new Set([...eligibleDueIds, ...admittedNewIds]);
      expect(new Set(orderIds)).toEqual(expectedIds);
      // No duplicates
      expect(orderIds.length).toBe(expectedIds.size);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Pair does NOT consume a newAllowance slot
  // -------------------------------------------------------------------------
  describe('pair does not consume a newAllowance slot', () => {
    it('admits lemma X + its pair when newAllowance is effectively 1, pair contiguous in order', () => {
      // newAllowance = 1 (steady-state cap 5, but 4 already introduced today)
      const ctx = baseCtx({
        accountAgeDays: 1, // steady-state cap = 5
        introducedToday: 4, // leaves newAllowance = 1
      });

      const lemmaX = makeWord('lemma-x', 1);
      const pairForX = makePair('pair-for-x', 2, {
        hasAudioEnvelope: true,
        blocksLemmaId: 'lemma-x',
      });
      const candidates: Candidate[] = [lemmaX, pairForX];

      const result = selectBatch({ due: [], candidates, ctx });

      expect(result.newAllowance).toBe(1);
      // Both must be admitted: the pair does not consume the 1 available slot
      const admittedIds = result.admittedNew.map(c => c.id);
      expect(admittedIds).toContain('lemma-x');
      expect(admittedIds).toContain('pair-for-x');

      // They must appear contiguous in order
      const orderIds = result.order.map(o => o.id);
      const lemmaIdx = orderIds.indexOf('lemma-x');
      const pairIdx = orderIds.indexOf('pair-for-x');
      expect(lemmaIdx).toBeGreaterThanOrEqual(0);
      expect(pairIdx).toBeGreaterThanOrEqual(0);
      expect(Math.abs(lemmaIdx - pairIdx)).toBe(1);
    });
  });
});

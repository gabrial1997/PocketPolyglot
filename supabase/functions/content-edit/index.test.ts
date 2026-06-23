/**
 * Deno unit tests for handleContentEdit (pure handler, mocked Deps).
 * Run with: deno test supabase/functions/content-edit/
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { handleContentEdit } from './index.ts';
import type { Deps } from './index.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_LEMMA_REQ = {
  table: 'lemmas' as const,
  id: VALID_UUID,
  fields: { gloss_en: 'updated gloss' },
};
const VALID_MP_REQ = {
  table: 'minimal_pairs' as const,
  id: VALID_UUID,
  qa_status: 'native_ok' as const,
};

// A Deps where everything succeeds (founder)
function makeFounderDeps(onApplyUpdate?: (table: string, id: string, patch: Record<string, string>) => void): Deps {
  return {
    getUserId: (_jwt: string) => Promise.resolve('user-abc-123'),
    isFounder: (_userId: string) => Promise.resolve(true),
    applyUpdate: (table: string, id: string, patch: Record<string, string>) => {
      onApplyUpdate?.(table, id, patch);
      return Promise.resolve();
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// (a) null jwt → 401, applyUpdate not called
Deno.test('(a) null jwt → 401, applyUpdate NOT called', async () => {
  let called = false;
  const deps = makeFounderDeps(() => { called = true; });

  const result = await handleContentEdit(VALID_LEMMA_REQ, null, deps);

  assertEquals(result.status, 401);
  assertEquals(called, false);
});

// (b) valid jwt but isFounder false → 403, applyUpdate not called
Deno.test('(b) valid jwt + isFounder false → 403, applyUpdate NOT called', async () => {
  let called = false;
  const deps: Deps = {
    getUserId: (_jwt: string) => Promise.resolve('non-founder-user'),
    isFounder: (_userId: string) => Promise.resolve(false),
    applyUpdate: () => { called = true; return Promise.resolve(); },
  };

  const result = await handleContentEdit(VALID_LEMMA_REQ, 'valid.jwt.token', deps);

  assertEquals(result.status, 403);
  assertEquals(called, false);
});

// (c) founder + invalid req (bad column on lemmas) → 400, applyUpdate not called
Deno.test('(c) founder + bad column → 400, applyUpdate NOT called', async () => {
  let called = false;
  const deps = makeFounderDeps(() => { called = true; });

  const badReq = {
    table: 'lemmas' as const,
    id: VALID_UUID,
    fields: { nonexistent_col: 'value' } as Record<string, string>,
  };

  const result = await handleContentEdit(
    badReq as Parameters<typeof handleContentEdit>[0],
    'valid.jwt.token',
    deps,
  );

  assertEquals(result.status, 400);
  assertEquals(called, false);
  const body = result.body as { error: string };
  assertEquals(body.error.includes('nonexistent_col'), true);
});

// (d) founder + valid lemma gloss_en edit → 200 + applyUpdate('lemmas', id, {gloss_en}) called once
Deno.test('(d) founder + valid lemma gloss_en edit → 200, applyUpdate called once', async () => {
  const calls: Array<{ table: string; id: string; patch: Record<string, string> }> = [];
  const deps = makeFounderDeps((table, id, patch) => { calls.push({ table, id, patch }); });

  const result = await handleContentEdit(VALID_LEMMA_REQ, 'valid.jwt.token', deps);

  assertEquals(result.status, 200);
  assertEquals(result.body, { ok: true });
  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.table, 'lemmas');
  assertEquals(calls[0]!.id, VALID_UUID);
  assertEquals(calls[0]!.patch, { gloss_en: 'updated gloss' });
});

// (e) founder + qa_status-only minimal_pairs edit → 200, applyUpdate('minimal_pairs', id, {qa_status})
Deno.test('(e) founder + minimal_pairs qa_status edit → 200, applyUpdate called once', async () => {
  const calls: Array<{ table: string; id: string; patch: Record<string, string> }> = [];
  const deps = makeFounderDeps((table, id, patch) => { calls.push({ table, id, patch }); });

  const result = await handleContentEdit(VALID_MP_REQ, 'valid.jwt.token', deps);

  assertEquals(result.status, 200);
  assertEquals(result.body, { ok: true });
  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.table, 'minimal_pairs');
  assertEquals(calls[0]!.id, VALID_UUID);
  assertEquals(calls[0]!.patch, { qa_status: 'native_ok' });
});

// Additional: getUserId returns null (bad JWT) → 401
Deno.test('getUserId null (bad JWT) → 401, applyUpdate NOT called', async () => {
  let called = false;
  const deps: Deps = {
    getUserId: (_jwt: string) => Promise.resolve(null),
    isFounder: (_userId: string) => Promise.resolve(true),
    applyUpdate: () => { called = true; return Promise.resolve(); },
  };

  const result = await handleContentEdit(VALID_LEMMA_REQ, 'bad.jwt.token', deps);

  assertEquals(result.status, 401);
  assertEquals(called, false);
});

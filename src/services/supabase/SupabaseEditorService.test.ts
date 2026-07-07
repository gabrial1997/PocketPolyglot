// Tests for SupabaseEditorService (isEditor + edit).
// Chain-mock pattern mirrors SupabaseProfileService.test.ts.
import { SupabaseEditorService } from './SupabaseEditorService';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// Chainable fake Supabase client that supports:
//  - from().select().eq().maybeSingle() — for isEditor
//  - client.functions.invoke() — for edit
function fakeClient() {
  const calls: { table: string; op: string; eq?: [string, unknown] }[] = [];
  let nextSelectRow: Record<string, unknown> | null = { settings: { editor: true } };
  let nextSelectError: { message: string } | null = null;

  // functions.invoke mock
  const invokeResults: { data: unknown; error: { message: string } | null }[] = [];
  const invokeCalls: { name: string; options: unknown }[] = [];

  const client = {
    from(table: string) {
      const ctx: { table: string; op: string; eq?: [string, unknown] } = { table, op: '' };
      const builder: Record<string, unknown> = {
        select() {
          ctx.op = 'select';
          return builder;
        },
        eq(col: string, val: unknown) {
          ctx.eq = [col, val];
          calls.push(ctx);
          return builder;
        },
        async maybeSingle() {
          const row = nextSelectRow;
          const err = nextSelectError;
          nextSelectError = null;
          return { data: err ? null : row, error: err };
        },
      };
      return builder;
    },
    functions: {
      invoke(name: string, options: unknown) {
        invokeCalls.push({ name, options });
        if (invokeResults.length > 0) {
          return Promise.resolve(invokeResults.shift()!);
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  };

  return {
    client,
    calls,
    invokeCalls,
    setRow: (r: Record<string, unknown> | null) => { nextSelectRow = r; },
    setSelectError: (msg: string) => { nextSelectError = { message: msg }; },
    queueInvokeResult: (result: { data: unknown; error: { message: string } | null }) => {
      invokeResults.push(result);
    },
  };
}

// --- isEditor tests ---

it('isEditor returns true when profiles.settings.editor === true', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseEditorService(client as never, 'user-1');
  expect(await svc.isEditor()).toBe(true);
  expect(calls[0]).toMatchObject({ table: 'profiles', op: 'select', eq: ['id', 'user-1'] });
});

it('isEditor returns false when settings.editor === false', async () => {
  const { client, setRow } = fakeClient();
  setRow({ settings: { editor: false } });
  const svc = new SupabaseEditorService(client as never, 'user-1');
  expect(await svc.isEditor()).toBe(false);
});

it('isEditor returns false when settings is null', async () => {
  const { client, setRow } = fakeClient();
  setRow({ settings: null });
  const svc = new SupabaseEditorService(client as never, 'user-1');
  expect(await svc.isEditor()).toBe(false);
});

it('isEditor returns false when settings is {} (no editor key)', async () => {
  const { client, setRow } = fakeClient();
  setRow({ settings: {} });
  const svc = new SupabaseEditorService(client as never, 'user-1');
  expect(await svc.isEditor()).toBe(false);
});

it('isEditor returns false when row is missing', async () => {
  const { client, setRow } = fakeClient();
  setRow(null);
  const svc = new SupabaseEditorService(client as never, 'user-1');
  expect(await svc.isEditor()).toBe(false);
});

it('isEditor throws when Supabase returns an error', async () => {
  const { client, setSelectError } = fakeClient();
  setSelectError('connection failed');
  const svc = new SupabaseEditorService(client as never, 'user-1');
  await expect(svc.isEditor()).rejects.toMatchObject({ message: 'connection failed' });
});

// --- edit tests (F5 — implement after isEditor) ---

it('edit(validReq) calls functions.invoke exactly once with content-edit and the request body', async () => {
  const { client, invokeCalls } = fakeClient();
  const svc = new SupabaseEditorService(client as never, 'user-1');
  const req = { table: 'lemmas' as const, id: VALID_UUID, fields: { gloss_en: 'hello' } };
  await svc.edit(req);
  expect(invokeCalls).toHaveLength(1);
  expect(invokeCalls[0]!.name).toBe('content-edit');
  expect((invokeCalls[0]!.options as { body: unknown }).body).toEqual(req);
});

it('edit(lemmas target) sends the WIRE request unmodified — no client-side column mapping', async () => {
  // The wire contract field is 'target' (ReviewItem.target); the Edge Function maps it to
  // the physical `lemma` column server-side (via validateContentEdit). The client must NOT
  // pre-map, or the server would double-map / reject. This guards that boundary.
  const { client, invokeCalls } = fakeClient();
  const svc = new SupabaseEditorService(client as never, 'user-1');
  const req = { table: 'lemmas' as const, id: VALID_UUID, fields: { target: 'labdien' } };
  await svc.edit(req);
  expect(invokeCalls).toHaveLength(1);
  expect((invokeCalls[0]!.options as { body: unknown }).body).toEqual({
    table: 'lemmas',
    id: VALID_UUID,
    fields: { target: 'labdien' }, // still the wire field, NOT { lemma: ... }
  });
});

it('edit throws when invoke returns an error', async () => {
  const { client, queueInvokeResult } = fakeClient();
  queueInvokeResult({ data: null, error: { message: 'edge function error' } });
  const svc = new SupabaseEditorService(client as never, 'user-1');
  const req = { table: 'lemmas' as const, id: VALID_UUID, fields: { gloss_en: 'hello' } };
  await expect(svc.edit(req)).rejects.toMatchObject({ message: 'edge function error' });
});

it('edit throws on invalid req BEFORE invoke is called', async () => {
  const { client, invokeCalls } = fakeClient();
  const svc = new SupabaseEditorService(client as never, 'user-1');
  const badReq = { table: 'lemmas' as const, id: 'not-a-uuid', fields: { gloss_en: 'hi' } };
  await expect(svc.edit(badReq)).rejects.toThrow();
  // invoke must NOT have been called — validation failed fast
  expect(invokeCalls).toHaveLength(0);
});

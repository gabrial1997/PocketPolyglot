import { SupabaseProfileService } from './SupabaseProfileService';

// Minimal chainable fake of the Supabase query builder, recording the calls we assert on.
function fakeClient() {
  const calls: { table: string; op: string; payload?: unknown; eq?: [string, unknown] }[] = [];
  let nextSelectRow: Record<string, unknown> | null = { rec_consent: true };
  const client = {
    from(table: string) {
      const ctx: { table: string; op: string; payload?: unknown; eq?: [string, unknown] } = { table, op: '' };
      const builder: Record<string, unknown> = {
        select() {
          ctx.op = 'select';
          return builder;
        },
        update(payload: unknown) {
          ctx.op = 'update';
          ctx.payload = payload;
          return builder;
        },
        delete() {
          ctx.op = 'delete';
          return builder;
        },
        eq(col: string, val: unknown) {
          ctx.eq = [col, val];
          calls.push(ctx);
          return builder;
        },
        async maybeSingle() {
          return { data: nextSelectRow, error: null };
        },
      };
      return builder;
    },
  };
  return { client, calls, setRow: (r: Record<string, unknown> | null) => { nextSelectRow = r; } };
}

it('getRecConsent reads profiles.rec_consent for the user', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  expect(await svc.getRecConsent()).toBe(true);
  expect(calls[0]).toMatchObject({ table: 'profiles', op: 'select', eq: ['id', 'user-1'] });
});

it('getRecConsent returns false when no profile row exists', async () => {
  const { client, setRow } = fakeClient();
  setRow(null);
  const svc = new SupabaseProfileService(client as never, 'user-1');
  expect(await svc.getRecConsent()).toBe(false);
});

it('setRecConsent(true) updates rec_consent and stamps rec_consent_at', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.setRecConsent(true);
  const update = calls.find((c) => c.op === 'update');
  expect(update?.table).toBe('profiles');
  expect(update?.eq).toEqual(['id', 'user-1']);
  expect((update?.payload as { rec_consent: boolean }).rec_consent).toBe(true);
  expect((update?.payload as { rec_consent_at: string | null }).rec_consent_at).not.toBeNull();
});

it('setRecConsent(false) clears rec_consent_at', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.setRecConsent(false);
  const update = calls.find((c) => c.op === 'update');
  expect((update?.payload as { rec_consent: boolean }).rec_consent).toBe(false);
  expect((update?.payload as { rec_consent_at: string | null }).rec_consent_at).toBeNull();
});

it('deleteRecordings deletes the user rows', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.deleteRecordings();
  const del = calls.find((c) => c.op === 'delete');
  expect(del).toMatchObject({ table: 'recordings', eq: ['user_id', 'user-1'] });
});

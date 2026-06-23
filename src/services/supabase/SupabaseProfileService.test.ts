import { SupabaseProfileService } from './SupabaseProfileService';

// Minimal chainable fake of the Supabase query builder, recording the calls we assert on.
function fakeClient() {
  const calls: { table: string; op: string; payload?: unknown; eq?: [string, unknown] }[] = [];
  // nextSelectRows: a queue — each call to maybeSingle() pops the front; if empty uses the last set.
  let nextSelectRows: (Record<string, unknown> | null)[] = [{ rec_consent: true }];
  // nextError: consumed by the next awaitable terminal (maybeSingle / eq-on-update-delete / insert).
  let nextError: { code?: string; message?: string } | null = null;
  // nextWriteError: consumed ONLY by write terminals (insert resolver and update/delete .eq() terminal).
  // Does NOT affect maybeSingle() so read-modify-write tests can let the read succeed and the write fail.
  let nextWriteError: { code?: string; message?: string } | null = null;

  const client = {
    from(table: string) {
      const ctx: { table: string; op: string; payload?: unknown; eq?: [string, unknown] } = { table, op: '' };
      const builder: Record<string, unknown> = {
        select() {
          ctx.op = 'select';
          return builder;
        },
        insert(payload: unknown) {
          ctx.op = 'insert';
          ctx.payload = payload;
          calls.push(ctx);
          // Insert terminal: awaitable, resolves { error }.
          // Prefer the targeted write-error slot; fall back to the general one-shot slot.
          const err = nextWriteError ?? nextError;
          nextWriteError = null;
          nextError = null;
          return Promise.resolve({ data: null, error: err });
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
          if (ctx.op === 'select') {
            // select chains to maybeSingle(); return builder so the caller can .maybeSingle()
            return builder;
          }
          // update/delete terminal: awaitable, resolves { data, error }.
          // Prefer the targeted write-error slot; fall back to the general one-shot slot.
          const err = nextWriteError ?? nextError;
          nextWriteError = null;
          nextError = null;
          return Promise.resolve({ data: null, error: err });
        },
        async maybeSingle() {
          // Pop the front of the queue if there are multiple rows queued (for read-modify-write tests).
          const row = nextSelectRows.length > 1 ? nextSelectRows.shift()! : nextSelectRows[0];
          // maybeSingle() only consumes the general error slot, NOT nextWriteError.
          const err = nextError;
          nextError = null;
          return { data: err ? null : row, error: err };
        },
      };
      return builder;
    },
  };
  return {
    client,
    calls,
    /** Set a single row returned by maybeSingle() */
    setRow: (r: Record<string, unknown> | null) => { nextSelectRows = [r]; },
    /** Queue multiple rows: first maybeSingle() call returns rows[0], second returns rows[1], etc. */
    setRows: (rows: (Record<string, unknown> | null)[]) => { nextSelectRows = [...rows]; },
    /**
     * Inject an error to be returned by the next awaitable terminal (insert / update .eq / delete .eq / maybeSingle).
     * Used by insert-error tests (e.g. 23505 duplicate-key). One-shot: cleared after consumption.
     */
    setNextError: (code: string, message = 'injected error') => { nextError = { code, message }; },
    /**
     * Inject an error to be returned ONLY by the next WRITE terminal (insert / update .eq / delete .eq).
     * maybeSingle() (the read path) ignores this slot, so read-modify-write tests can let the
     * read succeed and the write fail — targeting the update's writeError guard specifically.
     * One-shot: cleared after consumption.
     */
    setNextWriteError: (code: string, message = 'injected write error') => { nextWriteError = { code, message }; },
  };
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

// --- D1b: getProfile + ensureProfile ---

it('getProfile reads rec_consent, training_consent and settings.seenDiacritics', async () => {
  const { client, calls, setRow } = fakeClient();
  setRow({ rec_consent: true, training_consent: false, settings: { seenDiacritics: true } });
  const svc = new SupabaseProfileService(client as never, 'user-1');
  const snap = await svc.getProfile();
  expect(snap).toEqual({ recConsent: true, trainingConsent: false, seenDiacritics: true });
  expect(calls[0]).toMatchObject({ table: 'profiles', op: 'select', eq: ['id', 'user-1'] });
});

it('getProfile returns null when no row exists', async () => {
  const { client, setRow } = fakeClient();
  setRow(null);
  const svc = new SupabaseProfileService(client as never, 'user-1');
  expect(await svc.getProfile()).toBeNull();
});

it('getProfile treats missing settings.seenDiacritics as false', async () => {
  const { client, setRow } = fakeClient();
  setRow({ rec_consent: false, training_consent: false, settings: {} });
  const svc = new SupabaseProfileService(client as never, 'user-1');
  const snap = await svc.getProfile();
  expect(snap?.seenDiacritics).toBe(false);
});

it('ensureProfile inserts a profiles row with only the user id', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.ensureProfile();
  const ins = calls.find((c) => c.op === 'insert');
  expect(ins?.table).toBe('profiles');
  // Must include id but NOT override settings.editor or other settings keys.
  expect((ins?.payload as { id: string }).id).toBe('user-1');
  expect((ins?.payload as Record<string, unknown>).settings).toBeUndefined();
});

it('ensureProfile tolerates a 23505 unique-violation (row already exists)', async () => {
  const { client, setNextError } = fakeClient();
  setNextError('23505', 'duplicate key value violates unique constraint');
  const svc = new SupabaseProfileService(client as never, 'user-1');
  // Must resolve without throwing.
  await expect(svc.ensureProfile()).resolves.toBeUndefined();
});

it('ensureProfile re-throws a non-23505 insert error', async () => {
  const { client, setNextError } = fakeClient();
  setNextError('23503', 'foreign key violation');
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await expect(svc.ensureProfile()).rejects.toMatchObject({ code: '23503' });
});

// --- D2a: setSeenDiacritics (settings-merge, editor-safe) ---

it('setSeenDiacritics merges settings.seenDiacritics=true and preserves other keys', async () => {
  const { client, calls, setRows } = fakeClient();
  // First maybeSingle() call (the read) returns existing settings.
  // The update path does NOT call maybeSingle() — it resolves via .eq() directly.
  setRows([{ settings: { editor: true } }]);
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.setSeenDiacritics();
  const upd = calls.find((c) => c.op === 'update');
  expect(upd?.table).toBe('profiles');
  expect(upd?.eq).toEqual(['id', 'user-1']);
  const settings = (upd?.payload as { settings: Record<string, unknown> }).settings;
  expect(settings).toEqual({ editor: true, seenDiacritics: true });
});

it('setSeenDiacritics throws when no profile row exists (enforces ensureProfile invariant)', async () => {
  const { client, setRow } = fakeClient();
  setRow(null);
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await expect(svc.setSeenDiacritics()).rejects.toThrow('setSeenDiacritics: no profile row for user');
});

it('setSeenDiacritics surfaces a write error from the update', async () => {
  const { client, setRow, setNextWriteError } = fakeClient();
  // READ succeeds: maybeSingle() returns a real row and does NOT consume nextWriteError.
  setRow({ settings: {} });
  // WRITE fails: the update's .eq() terminal consumes nextWriteError — not the read path.
  // If the `if (writeError) throw writeError` guard in setSeenDiacritics were removed,
  // the error would be silently ignored and this test would FAIL (no rejection).
  setNextWriteError('42501', 'permission denied');
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await expect(svc.setSeenDiacritics()).rejects.toMatchObject({ code: '42501' });
});

// --- D3a: setConsent (rec + training + timestamp) ---

it('setConsent({rec:true,training:true}) stamps rec_consent_at and sets both flags', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.setConsent({ rec: true, training: true });
  const upd = calls.find((c) => c.op === 'update');
  expect(upd?.table).toBe('profiles');
  expect(upd?.eq).toEqual(['id', 'user-1']);
  const payload = upd?.payload as Record<string, unknown>;
  expect(payload.rec_consent).toBe(true);
  expect(payload.training_consent).toBe(true);
  expect(typeof payload.rec_consent_at).toBe('string');
  // Should be a valid ISO timestamp
  expect(() => new Date(payload.rec_consent_at as string).toISOString()).not.toThrow();
});

it('setConsent({rec:false,...}) clears rec_consent_at', async () => {
  const { client, calls } = fakeClient();
  const svc = new SupabaseProfileService(client as never, 'user-1');
  await svc.setConsent({ rec: false, training: false });
  const upd = calls.find((c) => c.op === 'update');
  const payload = upd?.payload as Record<string, unknown>;
  expect(payload.rec_consent).toBe(false);
  expect(payload.training_consent).toBe(false);
  expect(payload.rec_consent_at).toBeNull();
});

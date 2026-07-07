// E2: SupabaseRecordingUploader — consent-gated upload to the private `recordings` bucket.
//
// Scope fence: upload() inserts ONLY { id, user_id, storage_path, duration_ms, consent_at }.
// NEVER score / score_payload. No upload + no insert without consent.
//
// The Supabase client is faked with chainable builders for .storage.from().upload()/.remove()
// and .from('recordings').insert(). global fetch is mocked to return fake ArrayBuffer bytes
// (the RN-safe file-URI path — fetch(file://).blob() is unreliable in React Native).

import { SupabaseRecordingUploader } from './SupabaseRecordingUploader';

// ---------------------------------------------------------------------------
// Fake bytes helper
// ---------------------------------------------------------------------------
const FAKE_BYTES: ArrayBuffer = new TextEncoder().encode('audio-data').buffer as ArrayBuffer;

// ---------------------------------------------------------------------------
// Fake Supabase client builder
// ---------------------------------------------------------------------------
function makeFakeClient(opts: {
  uploadError?: object | null;
  insertError?: object | null;
  removeCalled?: string[];
}) {
  // Track calls for assertions.
  const calls = {
    storageUpload: null as { path: string; body: Blob | ArrayBuffer; options: Record<string, unknown> } | null,
    storageRemove: null as string[] | null,
    recordingsInsert: null as Record<string, unknown> | null,
  };

  const storageFrom = (_bucket: string) => ({
    upload: async (path: string, body: Blob | ArrayBuffer, options: Record<string, unknown>) => {
      calls.storageUpload = { path, body, options };
      return { data: { path }, error: opts.uploadError ?? null };
    },
    remove: async (paths: string[]) => {
      if (opts.removeCalled) opts.removeCalled.push(...paths);
      calls.storageRemove = paths;
      return { data: null, error: null };
    },
  });

  const fromTable = (table: string) => {
    if (table === 'recordings') {
      return {
        insert: async (row: Record<string, unknown>) => {
          calls.recordingsInsert = row;
          return { error: opts.insertError ?? null };
        },
      };
    }
    return {
      insert: async () => ({ error: null }),
    };
  };

  const client = {
    storage: { from: storageFrom },
    from: fromTable,
  };

  return { client, calls };
}

// ---------------------------------------------------------------------------
// Mock global fetch — the uploader reads the response as ArrayBuffer bytes (RN-safe),
// never as a Blob.
// ---------------------------------------------------------------------------
function mockFetch(bytes: ArrayBuffer = FAKE_BYTES) {
  const fetchMock = jest.fn().mockResolvedValue({
    arrayBuffer: jest.fn().mockResolvedValue(bytes),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SupabaseRecordingUploader.upload()', () => {
  const USER_ID = 'user-abc';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null immediately when recording is an empty string (falsy)', async () => {
    const fetchMock = mockFetch();
    const { client } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const result = await uploader.upload('');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null without upload or insert when consent is false', async () => {
    const fetchMock = mockFetch();
    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => false,
    );
    const result = await uploader.upload('file:///recording.m4a');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.storageUpload).toBeNull();
    expect(calls.recordingsInsert).toBeNull();
  });

  it('consent=true + string URI → fetch called, storage.upload called with path <userId>/<id>.m4a', async () => {
    const fetchMock = mockFetch();
    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const uri = 'file:///tmp/recording.m4a';
    const result = await uploader.upload(uri);

    // fetch must have been called with the URI
    expect(fetchMock).toHaveBeenCalledWith(uri);

    // storage.upload must have been called with path `${userId}/<uuid>.m4a`
    expect(calls.storageUpload).not.toBeNull();
    expect(calls.storageUpload!.path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.m4a$`));
    // 'audio/mp4' is the registered MIME type for an .m4a container ('audio/m4a' is not).
    expect(calls.storageUpload!.options).toMatchObject({ contentType: 'audio/mp4', upsert: false });

    // The file-URI path must upload raw ArrayBuffer bytes (RN-safe), not a fetched Blob.
    expect(calls.storageUpload!.body).toBe(FAKE_BYTES);

    // returned id must match the path segment after user_id/
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('consent=true + string URI → recordings.insert called with EXACTLY { id, user_id, storage_path, duration_ms, consent_at } and NO score/score_payload', async () => {
    mockFetch();
    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const result = await uploader.upload('file:///recording.m4a', { durationMs: 1234 });

    expect(calls.recordingsInsert).not.toBeNull();
    const row = calls.recordingsInsert!;

    // Exactly these 5 keys — nothing more.
    expect(Object.keys(row).sort()).toEqual(['consent_at', 'duration_ms', 'id', 'storage_path', 'user_id'].sort());

    // Values are correct.
    expect(row.id).toBe(result);
    expect(row.user_id).toBe(USER_ID);
    expect(row.storage_path).toBe(`${USER_ID}/${result}.m4a`);
    expect(row.duration_ms).toBe(1234);
    expect(typeof row.consent_at).toBe('string');

    // Scope fence: score and score_payload must NOT be present.
    expect('score' in row).toBe(false);
    expect('score_payload' in row).toBe(false);
  });

  it('returns the recording id on success', async () => {
    mockFetch();
    const { client } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const result = await uploader.upload('file:///recording.m4a');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('upload error → insert NOT called, returns null', async () => {
    mockFetch();
    const { client, calls } = makeFakeClient({ uploadError: { message: 'bucket full' } });
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const result = await uploader.upload('file:///recording.m4a');
    expect(result).toBeNull();
    expect(calls.storageUpload).not.toBeNull(); // upload was attempted
    expect(calls.recordingsInsert).toBeNull();   // insert was NOT called
  });

  it('insert error → best-effort remove called on the orphaned object, returns null', async () => {
    mockFetch();
    const removedPaths: string[] = [];
    const { client, calls } = makeFakeClient({
      insertError: { message: 'insert failed' },
      removeCalled: removedPaths,
    });
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const result = await uploader.upload('file:///recording.m4a');
    expect(result).toBeNull();
    expect(calls.storageUpload).not.toBeNull(); // upload was attempted
    expect(calls.recordingsInsert).not.toBeNull(); // insert was attempted
    // Orphan must have been removed.
    expect(removedPaths.length).toBeGreaterThan(0);
    expect(removedPaths[0]).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.m4a$`));
  });

  it('Blob input → no fetch called, uploads the blob directly', async () => {
    const fetchMock = mockFetch();
    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    const blob = new Blob(['direct-audio'], { type: 'audio/mp4' });
    const result = await uploader.upload(blob);

    // fetch must NOT have been called (blob is used directly)
    expect(fetchMock).not.toHaveBeenCalled();

    // storage.upload must have been called with the blob
    expect(calls.storageUpload).not.toBeNull();
    expect(calls.storageUpload!.body).toBe(blob);
    expect(result).not.toBeNull();
  });

  it('duration_ms defaults to null when not provided', async () => {
    mockFetch();
    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );
    await uploader.upload('file:///recording.m4a'); // no opts
    expect(calls.recordingsInsert!.duration_ms).toBeNull();
  });

  it('string URI + fetch REJECTS → upload() RESOLVES to null (never throws), insert NOT called', async () => {
    // Simulate a network failure: fetch itself rejects.
    const rejectingFetch = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = rejectingFetch as unknown as typeof fetch;

    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );

    // Must RESOLVE to null — not reject/throw — proving "never throws into submit".
    await expect(uploader.upload('file:///recording.m4a')).resolves.toBeNull();

    // fetch was attempted
    expect(rejectingFetch).toHaveBeenCalledWith('file:///recording.m4a');

    // insert must NOT have been called (we never got past fetch)
    expect(calls.recordingsInsert).toBeNull();
  });

  it('string URI + arrayBuffer() REJECTS → upload() RESOLVES to null (never throws)', async () => {
    // fetch resolves but reading the body fails (e.g. the file vanished mid-read).
    const fetchMock = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockRejectedValue(new Error('read failed')),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { client, calls } = makeFakeClient({});
    const uploader = new SupabaseRecordingUploader(
      client as never,
      USER_ID,
      async () => true,
    );

    await expect(uploader.upload('file:///recording.m4a')).resolves.toBeNull();
    expect(calls.storageUpload).toBeNull();
    expect(calls.recordingsInsert).toBeNull();
  });
});

import { SupabaseBugReportService } from './SupabaseBugReportService';

const FAKE_BLOB = new Blob(['png-bytes'], { type: 'image/png' });

function makeFakeClient(opts: { uploadError?: object | null; insertError?: object | null } = {}) {
  const calls = {
    upload: null as { bucket: string; path: string; options: Record<string, unknown> } | null,
    insert: null as Record<string, unknown> | null,
  };
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _blob: Blob, options: Record<string, unknown>) => {
          calls.upload = { bucket, path, options };
          return { data: { path }, error: opts.uploadError ?? null };
        },
      }),
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === 'bug_reports') calls.insert = row;
        return { error: opts.insertError ?? null };
      },
    }),
  };
  return { client, calls };
}

function mockFetch(blob: Blob = FAKE_BLOB) {
  const fetchMock = jest.fn().mockResolvedValue({ blob: jest.fn().mockResolvedValue(blob) });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('SupabaseBugReportService.submit()', () => {
  const USER = 'user-xyz';
  afterEach(() => jest.restoreAllMocks());

  it('with screenshot: uploads to bug-screenshots/<userId>/<uuid>.png and inserts with that path', async () => {
    mockFetch();
    const { client, calls } = makeFakeClient();
    const svc = new SupabaseBugReportService(client as never, USER);
    await svc.submit({ description: 'broke', screenshotUri: 'file:///s.png', screen: 'home', appVersion: '0.1.2', platform: 'ios', osVersion: '17' });

    expect(calls.upload).not.toBeNull();
    expect(calls.upload!.bucket).toBe('bug-screenshots');
    expect(calls.upload!.path).toMatch(new RegExp(`^${USER}/[0-9a-f-]+\\.png$`));
    expect(calls.upload!.options).toMatchObject({ contentType: 'image/png', upsert: false });

    expect(calls.insert).not.toBeNull();
    expect(calls.insert!.user_id).toBe(USER);
    expect(calls.insert!.description).toBe('broke');
    expect(calls.insert!.screen).toBe('home');
    expect(calls.insert!.app_version).toBe('0.1.2');
    expect(calls.insert!.platform).toBe('ios');
    expect(calls.insert!.os_version).toBe('17');
    expect(calls.insert!.screenshot_path).toBe(calls.upload!.path);
  });

  it('without screenshot: no upload, inserts screenshot_path = null', async () => {
    const fetchMock = mockFetch();
    const { client, calls } = makeFakeClient();
    const svc = new SupabaseBugReportService(client as never, USER);
    await svc.submit({ description: 'no shot' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.upload).toBeNull();
    expect(calls.insert!.screenshot_path).toBeNull();
    expect(calls.insert!.description).toBe('no shot');
  });

  it('screenshot upload error: still inserts text-only (screenshot_path null), does not throw', async () => {
    mockFetch();
    const { client, calls } = makeFakeClient({ uploadError: { message: 'bucket down' } });
    const svc = new SupabaseBugReportService(client as never, USER);
    await expect(svc.submit({ description: 'x', screenshotUri: 'file:///s.png' })).resolves.toBeUndefined();
    expect(calls.insert!.screenshot_path).toBeNull();
  });

  it('fetch rejects: still inserts text-only, does not throw', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch;
    const { client, calls } = makeFakeClient();
    const svc = new SupabaseBugReportService(client as never, USER);
    await expect(svc.submit({ description: 'x', screenshotUri: 'file:///s.png' })).resolves.toBeUndefined();
    expect(calls.insert!.screenshot_path).toBeNull();
  });

  it('insert error: throws', async () => {
    mockFetch();
    const { client } = makeFakeClient({ insertError: { message: 'rls denied' } });
    const svc = new SupabaseBugReportService(client as never, USER);
    await expect(svc.submit({ description: 'x' })).rejects.toBeTruthy();
  });
});

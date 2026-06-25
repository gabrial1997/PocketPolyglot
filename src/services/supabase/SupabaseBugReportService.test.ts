import { SupabaseBugReportService } from './SupabaseBugReportService';

// A tiny valid base64 string ("hi") — decoded to bytes by the service before upload.
const B64 = 'aGk=';

function makeFakeClient(opts: { uploadError?: object | null; uploadThrows?: boolean; insertError?: object | null } = {}) {
  const calls = {
    upload: null as { bucket: string; path: string; body: unknown; options: Record<string, unknown> } | null,
    insert: null as Record<string, unknown> | null,
  };
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown, options: Record<string, unknown>) => {
          if (opts.uploadThrows) throw new Error('storage network down');
          calls.upload = { bucket, path, body, options };
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

describe('SupabaseBugReportService.submit()', () => {
  const USER = 'user-xyz';
  afterEach(() => jest.restoreAllMocks());

  it('with screenshot: decodes base64 and uploads bytes to bug-screenshots/<userId>/<uuid>.png, inserts that path', async () => {
    const { client, calls } = makeFakeClient();
    const svc = new SupabaseBugReportService(client as never, USER);
    await svc.submit({ description: 'broke', screenshotBase64: B64, screen: 'home', appVersion: '0.1.2', platform: 'ios', osVersion: '17' });

    expect(calls.upload).not.toBeNull();
    expect(calls.upload!.bucket).toBe('bug-screenshots');
    expect(calls.upload!.path).toMatch(new RegExp(`^${USER}/[0-9a-f-]+\\.png$`));
    expect(calls.upload!.options).toMatchObject({ contentType: 'image/png', upsert: false });
    // Body is the decoded bytes (ArrayBuffer), not a file uri / blob-from-fetch.
    expect(calls.upload!.body).toBeInstanceOf(ArrayBuffer);
    expect((calls.upload!.body as ArrayBuffer).byteLength).toBeGreaterThan(0);

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
    const { client, calls } = makeFakeClient();
    const svc = new SupabaseBugReportService(client as never, USER);
    await svc.submit({ description: 'no shot' });
    expect(calls.upload).toBeNull();
    expect(calls.insert!.screenshot_path).toBeNull();
    expect(calls.insert!.description).toBe('no shot');
  });

  it('screenshot upload error: still inserts text-only (screenshot_path null), warns, does not throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, calls } = makeFakeClient({ uploadError: { message: 'bucket down' } });
    const svc = new SupabaseBugReportService(client as never, USER);
    await expect(svc.submit({ description: 'x', screenshotBase64: B64 })).resolves.toBeUndefined();
    expect(calls.insert!.screenshot_path).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('upload throws: still inserts text-only, warns, does not throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, calls } = makeFakeClient({ uploadThrows: true });
    const svc = new SupabaseBugReportService(client as never, USER);
    await expect(svc.submit({ description: 'x', screenshotBase64: B64 })).resolves.toBeUndefined();
    expect(calls.insert!.screenshot_path).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('insert error: throws', async () => {
    const { client } = makeFakeClient({ insertError: { message: 'rls denied' } });
    const svc = new SupabaseBugReportService(client as never, USER);
    await expect(svc.submit({ description: 'x' })).rejects.toBeTruthy();
  });
});

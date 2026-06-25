# Bug-Report Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a beta tester file a bug report (typed note + screenshot + auto-context) from any authenticated screen via a small floating button, stored in Supabase for triage; plus provision a fresh new-user account.

**Architecture:** A new `BugReportService` follows the existing Supabase service pattern (`createSupabaseServices(client, userId)`), uploading an optional PNG to a private Storage bucket then inserting a `bug_reports` row. A single `BugReportLayer` overlay is mounted once in `AuthGate` (above both onboarding and the tab shell) so the FAB floats on every screen; it captures the screen with `react-native-view-shot`, collects context, and calls the service. Cards/screens stay pure — the layer is the only new stateful UI and it reads services via the existing `useServices()` context.

**Tech Stack:** Expo SDK 54 / React Native 0.81 (TypeScript), Supabase (Postgres + Storage + RLS), `react-native-view-shot` (Included in Expo Go), Jest + React Native Testing Library.

## Global Constraints

- **TypeScript everywhere; no `any`** in service/contract code (CLAUDE.md). Use `as never` only in test fakes, matching existing service tests.
- **Cards are pure (data-in/events-out).** The bug-report UI is NOT a card; it lives in the app shell and may use `useServices()`. Do not add service imports to any card.
- **Service pattern:** new services are constructed in `createSupabaseServices(client, userId)` (`src/services/supabase/index.ts`), declared on `ServiceBundle` (`src/services/index.ts`), and given a Stub in `src/services/stubs.ts`.
- **Storage/RLS:** user-scoped client only — NEVER a service-role key client-side (CLAUDE.md). Uploads go under a `{user_id}/` prefix; RLS restricts to own folder.
- **Resilience:** screenshot capture/upload is best-effort — a failed screenshot must NOT block the text report. Only an insert failure surfaces an error to the user.
- **Keep CI green:** `npm run lint && npm run typecheck && npm test` all pass on every commit.
- **App version source:** `Constants.expoConfig?.version` (currently `0.1.2`).
- **Beta build is unpushed; FAB is always-on** (no gating flag this iteration).
- **Supabase project:** `necfghfotwykjsykccsa`. DB changes are applied to the remote via the Supabase MCP (no local CLI stack in this workflow).

---

### Task 1: Provision fresh new-user account + reset script

No code/TDD — this is a provisioning task plus a committed helper SQL file.

**Files:**
- Create: `scripts/reset-new-user.sql`

**Interfaces:**
- Produces: a usable login `newuser@pocketpolyglot.dev` / `Polyglot123!`; a reusable reset script.

- [ ] **Step 1: Create the auth user via Supabase MCP**

Use the Supabase MCP `execute_sql` against project `necfghfotwykjsykccsa`. Insert a pre-confirmed user (mirrors how `test@pocketpolyglot.dev` was created). Run:

```sql
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
   'newuser@pocketpolyglot.dev', crypt('Polyglot123!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}')
on conflict (email) do nothing;
```

Expected: 1 row inserted (or 0 if it already exists). The `handle_new_user` trigger (migration 0010) auto-creates the matching `profiles` row with empty `settings` and `rec_consent=false`.

- [ ] **Step 2: Verify the profile is fresh**

Run via MCP `execute_sql`:

```sql
select u.email, p.settings, p.rec_consent
from auth.users u join profiles p on p.id = u.id
where u.email = 'newuser@pocketpolyglot.dev';
```

Expected: one row, `settings` = `{}` (no `seenDiacritics`), `rec_consent` = `false`. This guarantees the new-user onboarding (diacritic orientation → consent) fires and day-one pacing applies (no `review_state` rows).

- [ ] **Step 3: Write the reset script**

Create `scripts/reset-new-user.sql` so the new-user flow can be replayed on demand:

```sql
-- Reset newuser@pocketpolyglot.dev back to first-run state.
-- Run via Supabase MCP execute_sql (project necfghfotwykjsykccsa) or the SQL editor.
with u as (select id from auth.users where email = 'newuser@pocketpolyglot.dev')
update profiles
   set settings = settings - 'seenDiacritics',
       rec_consent = false,
       rec_consent_at = null,
       training_consent = false
 where id = (select id from u);

delete from review_state where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
delete from review_log  where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
delete from recordings  where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
```

- [ ] **Step 4: Verify the reset script runs**

Run the contents of `scripts/reset-new-user.sql` via MCP `execute_sql`. Expected: succeeds with no error; re-running Step 2's query still shows `settings` without `seenDiacritics`.

- [ ] **Step 5: Commit**

```bash
git add scripts/reset-new-user.sql
git commit -m "chore(beta): fresh new-user account + replayable reset script"
```

---

### Task 2: `bug_reports` table + `bug-screenshots` Storage bucket

DB change applied to the remote via MCP; the migration file is committed for repo record. No unit test — verification is a live schema query.

**Files:**
- Create: `supabase/migrations/0011_bug_reports.sql`

**Interfaces:**
- Produces: table `public.bug_reports` (columns below) + private bucket `bug-screenshots` with own-folder RLS. Consumed by `SupabaseBugReportService` (Task 4).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0011_bug_reports.sql`:

```sql
-- 0011: in-app bug reports (beta tooling). Table + private screenshot bucket, RLS-scoped to owner.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  description text not null,
  screen text,
  app_version text,
  platform text,
  os_version text,
  screenshot_path text,
  extra jsonb not null default '{}'::jsonb,
  status text not null default 'open'
);

alter table public.bug_reports enable row level security;

create policy "bug_reports own insert" on public.bug_reports
  for insert to authenticated with check (auth.uid() = user_id);
create policy "bug_reports own select" on public.bug_reports
  for select to authenticated using (auth.uid() = user_id);

-- Private screenshot bucket (no public read).
insert into storage.buckets (id, name, public)
  values ('bug-screenshots', 'bug-screenshots', false)
  on conflict (id) do nothing;

create policy "bug screenshots own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bug-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bug screenshots own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bug-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration via MCP**

Use the Supabase MCP `apply_migration` (name `bug_reports`, the SQL above) against project `necfghfotwykjsykccsa`. Expected: success, no error.

- [ ] **Step 3: Verify the schema landed**

Run via MCP `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='bug_reports' order by ordinal_position;
select id, public from storage.buckets where id='bug-screenshots';
select polname from pg_policies where tablename='bug_reports';
```

Expected: 10 columns (`id, user_id, created_at, description, screen, app_version, platform, os_version, screenshot_path, extra, status` — note `status` makes 11 listed; confirm all present), the bucket row with `public=false`, and the two `bug_reports` policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_bug_reports.sql
git commit -m "feat(db): bug_reports table + private bug-screenshots bucket (RLS)"
```

---

### Task 3: `BugReportService` interface, Stub, and factory wiring

Scaffolding consumed by both Task 4 (real impl) and Task 5 (UI). Deliverable: types compile, stub bundle includes `bugReport`.

**Files:**
- Modify: `src/services/index.ts` (add interface + `ServiceBundle.bugReport`)
- Modify: `src/services/stubs.ts` (add `StubBugReportService` + include in `createStubServices`)
- Modify: `src/services/supabase/index.ts` (export + construct in `createSupabaseServices`)

**Interfaces:**
- Produces:
  ```ts
  interface BugReportInput {
    description: string;
    screen?: string;
    appVersion?: string;
    platform?: string;
    osVersion?: string;
    screenshotUri?: string;          // local file:// uri from captureScreen()
    extra?: Record<string, unknown>;
  }
  interface BugReportService { submit(input: BugReportInput): Promise<void>; }
  ```
  `ServiceBundle.bugReport: BugReportService`.

- [ ] **Step 1: Add the interface + bundle field in `src/services/index.ts`**

After the `EditorService` interface (around line 73), add:

```ts
/** A bug report filed from the in-app beta reporter (BugReportLayer). */
export interface BugReportInput {
  description: string;
  /** Coarse screen tag the report was filed from (e.g. 'home', 'session', 'onboarding'). */
  screen?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  /** Local file uri of the captured screenshot; uploaded best-effort (optional). */
  screenshotUri?: string;
  /** Arbitrary extra diagnostics (jsonb). */
  extra?: Record<string, unknown>;
}

/** Beta tooling: store a tester's bug report (note + optional screenshot + context). */
export interface BugReportService {
  /** Upload the optional screenshot, then insert the report row. Throws only on insert failure. */
  submit(input: BugReportInput): Promise<void>;
}
```

In `interface ServiceBundle` (after `editor: EditorService;`, ~line 115) add:

```ts
  /** Beta tooling: in-app bug reporter. */
  bugReport: BugReportService;
```

- [ ] **Step 2: Add the Stub in `src/services/stubs.ts`**

Add `BugReportService`, `BugReportInput` to the type import block at the top. After `StubEditorService` (~line 154) add:

```ts
export class StubBugReportService implements BugReportService {
  /** Records the last submitted report so tests/dev can assert without a backend. */
  public last: BugReportInput | null = null;
  async submit(input: BugReportInput): Promise<void> {
    this.last = input;
  }
}
```

In `createStubServices()` add `bugReport: new StubBugReportService(),` to the returned bundle.

- [ ] **Step 3: Wire the real service placeholder in `createSupabaseServices`**

In `src/services/supabase/index.ts`, add the import + export + construction. Add near the other imports:

```ts
import { SupabaseBugReportService } from './SupabaseBugReportService';
```

Add to the exports block:

```ts
export { SupabaseBugReportService } from './SupabaseBugReportService';
```

In `createSupabaseServices`, add to the returned bundle (after `editor: ...`):

```ts
    bugReport: new SupabaseBugReportService(client, userId),
```

> Note: this references `SupabaseBugReportService`, created in Task 4. Implement Task 4 before running typecheck, OR temporarily stub the class. Recommended: do Step 1–2 here, then Task 4, then Step 3.

- [ ] **Step 4: Typecheck (after Task 4's file exists)**

Run: `npm run typecheck`
Expected: PASS (no missing-member errors on `ServiceBundle`).

- [ ] **Step 5: Commit**

```bash
git add src/services/index.ts src/services/stubs.ts src/services/supabase/index.ts
git commit -m "feat(services): BugReportService interface + stub + factory wiring"
```

---

### Task 4: `SupabaseBugReportService` (TDD)

**Files:**
- Create: `src/services/supabase/SupabaseBugReportService.ts`
- Test: `src/services/supabase/SupabaseBugReportService.test.ts`

**Interfaces:**
- Consumes: `BugReportInput`, `BugReportService` (Task 3); `bug_reports` table + `bug-screenshots` bucket (Task 2).
- Produces: `class SupabaseBugReportService implements BugReportService` with `constructor(client: SupabaseClient, userId: string)`.

- [ ] **Step 1: Write the failing test**

Create `src/services/supabase/SupabaseBugReportService.test.ts` (fake-client style mirrors `SupabaseRecordingUploader.test.ts`):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SupabaseBugReportService`
Expected: FAIL — cannot find module `./SupabaseBugReportService`.

- [ ] **Step 3: Write the implementation**

Create `src/services/supabase/SupabaseBugReportService.ts`:

```ts
// Beta tooling: store a tester's bug report. Screenshot upload is best-effort (text-only on failure);
// only an insert failure throws. User-scoped client only — never a service-role key (CLAUDE.md).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BugReportInput, BugReportService } from '../index';

export class SupabaseBugReportService implements BugReportService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async submit(input: BugReportInput): Promise<void> {
    let screenshot_path: string | null = null;

    if (input.screenshotUri) {
      // Best-effort: a failed screenshot must NOT block the text report.
      try {
        const id = crypto.randomUUID();
        const path = `${this.userId}/${id}.png`;
        const blob = await fetch(input.screenshotUri).then((r) => r.blob());
        const { error } = await this.client.storage
          .from('bug-screenshots')
          .upload(path, blob, { contentType: 'image/png', upsert: false });
        if (!error) screenshot_path = path;
      } catch {
        screenshot_path = null;
      }
    }

    const { error } = await this.client.from('bug_reports').insert({
      user_id: this.userId,
      description: input.description,
      screen: input.screen ?? null,
      app_version: input.appVersion ?? null,
      platform: input.platform ?? null,
      os_version: input.osVersion ?? null,
      screenshot_path,
      extra: input.extra ?? {},
    });
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- SupabaseBugReportService`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (Task 3 Step 3's reference now resolves).

- [ ] **Step 6: Commit**

```bash
git add src/services/supabase/SupabaseBugReportService.ts src/services/supabase/SupabaseBugReportService.test.ts
git commit -m "feat(services): SupabaseBugReportService — screenshot upload + report insert"
```

---

### Task 5: `BugReportLayer` overlay — FAB, sheet, screen-tag context (TDD)

**Files:**
- Create: `src/components/BugReportLayer.tsx`
- Test: `src/components/BugReportLayer.test.tsx`
- Modify: `package.json` (adds `react-native-view-shot` via `expo install`)

**Interfaces:**
- Consumes: `useServices().bugReport` (Task 3); `captureScreen` from `react-native-view-shot`.
- Produces:
  - `function BugReportLayer({ children }: { children: React.ReactNode }): JSX.Element` — renders children, a FAB, and the report sheet.
  - `function useSetReportScreen(): (screen: string) => void` — descendants call this in an effect to tag the current screen (no-op outside a `BugReportLayer`).

- [ ] **Step 1: Install the screenshot dependency**

Run: `npx expo install react-native-view-shot`
Expected: adds `react-native-view-shot` to `package.json` dependencies at the SDK-54-compatible version.

- [ ] **Step 2: Write the failing test**

Create `src/components/BugReportLayer.test.tsx`:

```tsx
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import type { ServiceBundle, BugReportInput } from '../services';
import { BugReportLayer, useSetReportScreen } from './BugReportLayer';

jest.mock('react-native-view-shot', () => ({
  captureScreen: jest.fn().mockResolvedValue('file:///shot.png'),
}));

function renderLayer(submit: (i: BugReportInput) => Promise<void>, child?: React.ReactNode) {
  const services = { ...createStubServices(), bugReport: { submit } } as ServiceBundle;
  return render(
    <ServiceProvider services={services}>
      <BugReportLayer>{child ?? <Text>content</Text>}</BugReportLayer>
    </ServiceProvider>,
  );
}

describe('BugReportLayer', () => {
  it('tapping the FAB opens the report sheet (captures the screen)', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByPlaceholderText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => expect(getByPlaceholderText('What went wrong?')).toBeTruthy());
  });

  it('submitting calls bugReport.submit with description + screenshot + context', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByPlaceholderText, getByText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.changeText(getByPlaceholderText('What went wrong?'), 'the orb is stuck');
    fireEvent.press(getByText('Send report'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const arg = submit.mock.calls[0][0] as BugReportInput;
    expect(arg.description).toBe('the orb is stuck');
    expect(arg.screenshotUri).toBe('file:///shot.png');
    expect(typeof arg.appVersion).toBe('string');
    expect(typeof arg.platform).toBe('string');
  });

  it('submit failure keeps the typed text and re-enables sending', async () => {
    const submit = jest.fn().mockRejectedValue(new Error('rls'));
    const { getByLabelText, getByPlaceholderText, getByText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.changeText(getByPlaceholderText('What went wrong?'), 'keep me');
    fireEvent.press(getByText('Send report'));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    // Text preserved after failure.
    expect(getByPlaceholderText('What went wrong?').props.value).toBe('keep me');
  });

  it('useSetReportScreen tags the screen passed to submit', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    function Tagger() {
      const setScreen = useSetReportScreen();
      useEffect(() => setScreen('podcast'), [setScreen]);
      return <Text>tagged</Text>;
    }
    const { getByLabelText, getByPlaceholderText, getByText } = renderLayer(submit, <Tagger />);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.changeText(getByPlaceholderText('What went wrong?'), 'x');
    fireEvent.press(getByText('Send report'));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((submit.mock.calls[0][0] as BugReportInput).screen).toBe('podcast');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- BugReportLayer`
Expected: FAIL — cannot find module `./BugReportLayer`.

- [ ] **Step 4: Write the implementation**

Create `src/components/BugReportLayer.tsx`:

```tsx
// Beta tooling overlay: a floating "report a bug" button on every authenticated screen.
// Captures the current screen, collects context, and submits via the injected BugReportService.
// NOT a card — it is shell-level UI and may read useServices().
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Platform, ActivityIndicator, SafeAreaView,
} from 'react-native';
import Constants from 'expo-constants';
import { captureScreen } from 'react-native-view-shot';
import { useServices } from '../services/ServiceProvider';
import { useTheme } from '../theme/ThemeProvider';

// Screen-tag context: descendants call useSetReportScreen()(name) to label where a report came from.
const SetScreenContext = createContext<(screen: string) => void>(() => {});
export function useSetReportScreen(): (screen: string) => void {
  return useContext(SetScreenContext);
}

export function BugReportLayer({ children }: { children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  const { bugReport } = useServices();
  const [screen, setScreen] = useState('app');
  const [open, setOpen] = useState(false);
  const [shotUri, setShotUri] = useState<string | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSheet = useCallback(async () => {
    let uri: string | undefined;
    try {
      uri = await captureScreen({ format: 'png', quality: 0.8 });
    } catch {
      uri = undefined; // best-effort; text-only still works
    }
    setShotUri(uri);
    setError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setText('');
    setShotUri(undefined);
    setError(null);
  }, []);

  const send = useCallback(async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await bugReport.submit({
        description: text.trim(),
        screen,
        screenshotUri: shotUri,
        appVersion: Constants.expoConfig?.version,
        platform: Platform.OS,
        osVersion: String(Platform.Version),
      });
      setBusy(false);
      close();
    } catch {
      // Keep the typed text so the tester can retry.
      setBusy(false);
      setError('Could not send — try again.');
    }
  }, [text, busy, bugReport, screen, shotUri, close]);

  const ctx = useMemo(() => setScreen, []);

  return (
    <SetScreenContext.Provider value={ctx}>
      <View style={styles.fill}>
        {children}
        {!open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report a bug"
            onPress={openSheet}
            style={[styles.fab, { backgroundColor: T.primary }]}
          >
            <Text style={styles.fabGlyph}>🐞</Text>
          </Pressable>
        ) : null}
        {open ? (
          <SafeAreaView style={styles.sheetWrap}>
            <View style={[styles.sheet, { backgroundColor: T.bg, borderColor: T.hair }]}>
              <Text style={[styles.title, { color: T.text }]}>Report a bug</Text>
              {shotUri ? (
                <Text style={[styles.meta, { color: T.faint }]}>Screenshot attached</Text>
              ) : (
                <Text style={[styles.meta, { color: T.faint }]}>No screenshot (capture failed)</Text>
              )}
              <TextInput
                placeholder="What went wrong?"
                placeholderTextColor={T.faint}
                value={text}
                onChangeText={setText}
                multiline
                style={[styles.input, { color: T.text, borderColor: T.hair }]}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                <Pressable accessibilityRole="button" onPress={close} style={styles.btn}>
                  <Text style={{ color: T.faint }}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={send}
                  disabled={!text.trim() || busy}
                  style={[styles.btn, styles.send, { backgroundColor: T.primary, opacity: !text.trim() || busy ? 0.5 : 1 }]}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send report</Text>}
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    </SetScreenContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: {
    position: 'absolute', right: 16, bottom: 96, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', opacity: 0.6,
  },
  fabGlyph: { fontSize: 20 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { margin: 12, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  meta: { fontSize: 12, marginBottom: 8 },
  input: { minHeight: 80, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, textAlignVertical: 'top' },
  error: { color: '#C0392B', marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  send: {},
  sendText: { color: '#fff', fontWeight: '700' },
});
```

> If `useTheme()` exposes different token names than `T.primary / T.bg / T.text / T.faint / T.hair`, read `src/theme/ThemeProvider.tsx` and substitute the actual names — these match the tokens already used in `src/navigation/index.tsx` (`T.primary`, `T.bg`, `T.hair`, `T.faint`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- BugReportLayer`
Expected: PASS (4 tests).

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/BugReportLayer.tsx src/components/BugReportLayer.test.tsx package.json package-lock.json
git commit -m "feat(beta): BugReportLayer — floating report button, screenshot sheet, screen tag"
```

---

### Task 6: Mount the layer in `AuthGate` + tag screens

Wires the overlay into the running app so the FAB appears on every authenticated screen, and tags the current route.

**Files:**
- Modify: `src/navigation/index.tsx` (mount `BugReportLayer` in `AuthGate`; tag route in `Root`)
- Modify: `src/onboarding/OnboardingGate.tsx` (tag `'onboarding'`)

**Interfaces:**
- Consumes: `BugReportLayer`, `useSetReportScreen` (Task 5).

- [ ] **Step 1: Mount `BugReportLayer` in `AuthGate`**

In `src/navigation/index.tsx`, add the import:

```ts
import { BugReportLayer, useSetReportScreen } from '../components/BugReportLayer';
```

In `AuthGate`'s return, wrap the onboarding/app subtree so the FAB overlays both onboarding and the tabs (inside `ServiceProvider` so `useServices()` resolves):

```tsx
  return (
    <ServiceProvider services={services}>
      <EditorProvider>
        <BugReportLayer>
          <OnboardingGate>
            <Root />
          </OnboardingGate>
        </BugReportLayer>
      </EditorProvider>
    </ServiceProvider>
  );
```

- [ ] **Step 2: Tag the current route in `Root`**

In `Root` (`src/navigation/index.tsx`), after `const [route, setRoute] = useState<Route>('home');` add:

```tsx
  const setReportScreen = useSetReportScreen();
  useEffect(() => { setReportScreen(route); }, [route, setReportScreen]);
```

(`useEffect` is already imported in this file.)

- [ ] **Step 3: Tag onboarding screens**

In `src/onboarding/OnboardingGate.tsx`, import and call the tagger so reports filed during onboarding read `'onboarding'`:

```tsx
import { useSetReportScreen } from '../components/BugReportLayer';
```

Inside the `OnboardingGate` component body, add:

```tsx
  const setReportScreen = useSetReportScreen();
  useEffect(() => { setReportScreen('onboarding'); }, [setReportScreen]);
```

(Confirm `useEffect` is imported in that file; add it to the React import if missing.)

- [ ] **Step 4: Lint, typecheck, full test suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — full suite green (prior 591 + the new tests).

- [ ] **Step 5: Commit**

```bash
git add src/navigation/index.tsx src/onboarding/OnboardingGate.tsx
git commit -m "feat(beta): mount BugReportLayer in AuthGate + tag current screen"
```

- [ ] **Step 6: On-device verification (manual, by the user)**

Run `npm run phone`, open in Expo Go, and confirm:
1. The 🐞 FAB shows on Today/Listen/Progress/Settings, inside a session, and during the new-user onboarding (sign in as `newuser@pocketpolyglot.dev`).
2. Tapping it shows the sheet with "Screenshot attached"; type a note; "Send report" closes the sheet.
3. Verify the row landed — via MCP `execute_sql`:
   ```sql
   select created_at, screen, app_version, platform, description, screenshot_path
   from bug_reports order by created_at desc limit 5;
   ```
   Expected: the new report with the correct `screen` tag and a non-null `screenshot_path`.
4. Open the screenshot to confirm upload: list `bug-screenshots` via the Storage section or MCP.

---

## Self-Review

**Spec coverage:**
- Fresh new-user account + replay reset → Task 1. ✓
- `bug_reports` table + RLS + private bucket → Task 2. ✓
- Service (upload best-effort + insert, throws on insert error) → Task 4; interface/stub/factory → Task 3. ✓
- FAB on every authenticated screen, bottom-right, captureScreen, sheet with note, auto-context (screen, app version, platform, os, timestamp via DB default, user via service) → Tasks 5 + 6. ✓
- Screenshot included via `react-native-view-shot` → Task 5. ✓
- Destination Supabase, triage via service-role MCP → Tasks 2/4 + Task 6 Step 6. ✓
- Out-of-scope (email/name, category, in-app inbox, GitHub sync, beta flag, draggable FAB) → not built. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; the one conditional note (theme token names) gives the exact fallback values.

**Type consistency:** `BugReportInput` / `BugReportService` / `submit(input)` identical across index.ts, stubs.ts, the service, and the layer. `useSetReportScreen` signature `(screen: string) => void` matches its consumers in Root/OnboardingGate. `SupabaseBugReportService(client, userId)` matches the factory call.

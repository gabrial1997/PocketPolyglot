# Bug-Report Feature + Fresh New-User Account — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending spec review
**Context:** v1.0.0 core-loop is built & merged to `main` (`d3c1b50`); we are entering on-device
beta testing via `npm run phone` (Expo Go). This spec covers two beta-enablement asks:
a self-serve in-app bug reporter, and a fresh account for exercising the new-user experience.

---

## Part 0 — Fresh new-user account (provisioning step, not a code change)

The app decides "new user" purely from server state:
- Onboarding gate = `profiles.settings.seenDiacritics` (jsonb flag). Empty/absent → diacritic
  orientation shows. (`src/onboarding/OnboardingGate.tsx`)
- Recording consent = `profiles.rec_consent` (default `false`).
- Day-one pacing = absence of `review_state` rows for the user.

Therefore a brand-new Supabase auth user — whose profile is auto-created by the `handle_new_user`
trigger (migration `0010`) with empty `settings` and `rec_consent=false` — lands in the full
new-user experience with no code changes.

**Deliverables:**
1. Create pre-confirmed auth user **`newuser@pocketpolyglot.dev` / `Polyglot123!`** (via Supabase MCP).
   The existing `test@pocketpolyglot.dev` remains the "full app" account.
2. Provide a **reset snippet** so the new-user flow can be replayed on demand:
   ```sql
   update profiles
     set settings = settings - 'seenDiacritics',
         rec_consent = false, rec_consent_at = null, training_consent = false
   where id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
   delete from review_state where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
   delete from review_log  where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
   ```
   (Saved to the repo, e.g. `scripts/reset-new-user.sql`, for reuse.)

No spec review or implementation plan needed for Part 0 — it is a one-off provisioning action.

---

## Part 1 — In-app bug reporter

### Goal
From any authenticated screen, the tester taps a small floating button, the app captures the current
screen, the tester types a note, and a report (note + screenshot + auto-context) is stored in Supabase
for triage via the service-role MCP.

### Decisions (locked)
- **Trigger:** small floating button (FAB), bottom-right, just above the tab bar, ~60% opacity.
  (Shake rejected — conflicts with Expo Go's dev menu.)
- **Screenshot:** yes — `react-native-view-shot` `captureScreen()` (confirmed *Included in Expo Go*,
  no custom dev build needed). Optional: if capture fails, text-only still submits.
- **Destination:** Supabase table `bug_reports` + private Storage bucket `bug-screenshots`.
- **No email/name field** (deferred). No category/severity field (YAGNI).
- **Always-on** for now (unpushed beta build); trivially gated behind a flag later.

### Data layer

**Migration `0011_bug_reports.sql`:**
```sql
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
create policy "own insert" on public.bug_reports
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own select" on public.bug_reports
  for select to authenticated using (auth.uid() = user_id);
```
Triage reads use the service-role MCP, so no broad select policy is added.

**Storage bucket `bug-screenshots`** (private). RLS so an authenticated user may upload/read only
within their own `{user_id}/` prefix:
```sql
create policy "own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bug-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bug-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
```

### Service layer

`src/services/supabase/SupabaseBugReportService.ts`, constructed by `createSupabaseServices(client, userId)`
like the existing services and exposed through the services context.

```ts
interface BugReportInput {
  description: string;
  screen?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  screenshotUri?: string;   // local file:// from captureScreen()
}
interface BugReportService {
  submit(input: BugReportInput): Promise<void>;
}
```
`submit`:
1. If `screenshotUri`, read the file and upload to `bug-screenshots/{userId}/{timestamp}.png`;
   capture the returned storage path. Upload failure is non-fatal — log, continue with `screenshot_path=null`.
2. Insert a `bug_reports` row with the description + context fields.
3. Throw on insert error (so the UI can keep the text and let the user retry).

A fake in-memory `BugReportService` mirrors the other fakes for tests.

### UI layer

`src/components/BugReportFab.tsx` (FAB + report sheet; may split into `BugReportFab` and
`BugReportSheet`). Mounted **once** in the authenticated app shell (navigation root / `AuthGate`),
above the tab content, so it overlays every screen. It is a presentational component fed the current
route + a `submit` callback by its host — it imports no service directly (card-purity-style boundary).

Interaction:
1. Tap FAB → `captureScreen({ format: 'png' })` → local uri (best-effort; null on failure).
2. Open sheet: screenshot thumbnail (if any) + multiline `TextInput` (placeholder "What went wrong?")
   + Cancel / Submit. Submit disabled while description is empty or while submitting.
3. Submit → host calls `bugReport.submit({ description, screen: currentRoute, appVersion, platform,
   osVersion, screenshotUri })`. On success: brief "Thanks — report sent" confirmation, close, clear.
   On error: inline error, keep the typed text, re-enable Submit.

Auto-context sources: `currentRoute` from the nav shell state; `appVersion` from
`Constants.expoConfig?.version`; `platform`/`osVersion` from `Platform.OS` / `Platform.Version`;
`user_id` server-side via `auth.uid()` default; timestamp via `created_at` default.

### Error handling
- Screenshot capture failure → proceed text-only (no screenshot).
- Screenshot upload failure → submit row with `screenshot_path=null` (don't lose the report).
- Insert failure → surface inline, preserve typed text, allow retry.

### Testing
- **Service unit test** (fake supabase client): asserts upload path shape `{userId}/...png` + insert
  payload; screenshot-absent path inserts with `screenshot_path=null`; insert error propagates.
- **Sheet component test** (RNTL): renders; Submit calls `submit` with description + injected context;
  error keeps the text and re-enables Submit; `react-native-view-shot` mocked.

### Files
- `supabase/migrations/0011_bug_reports.sql` (apply via MCP) + Storage bucket + policies (via MCP)
- `src/services/supabase/SupabaseBugReportService.ts` + interface + `createSupabaseServices` wiring +
  services context + fake impl
- `src/components/BugReportFab.tsx` (+ optional `BugReportSheet.tsx`)
- mount in the authenticated shell (`src/navigation/index.tsx` / `AuthGate`)
- `scripts/reset-new-user.sql`
- `react-native-view-shot` dependency (`npx expo install`)
- tests alongside the above

### Out of scope (YAGNI)
Email/name field, category/severity, report list/inbox screen in-app, GitHub-issue sync, beta-only
gating flag, draggable FAB.

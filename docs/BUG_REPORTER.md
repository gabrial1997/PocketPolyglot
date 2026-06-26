# In-App Bug Reporter (🐞 button)

Beta tooling so a tester can file a bug from any screen: tap the floating 🐞 button → it
screenshots the current screen → a sheet opens for a note → it submits the note + screenshot +
device context to Supabase. Built 2026-06-25; live on `main`.

## How it works (architecture)

- **`src/components/BugReportLayer.tsx`** — the overlay. Mounted ONCE in `AuthGate`
  (`src/navigation/index.tsx`), *inside* `ServiceProvider`/`EditorProvider` and *wrapping*
  `OnboardingGate` + `Root`, so the 🐞 FAB shows on **every authenticated screen incl. onboarding +
  sessions**. It is shell-level UI (NOT a card) and may use `useServices()`.
  - Tap the FAB → `captureRef(contentRef, { format: 'png', result: 'base64' })` grabs the app
    content (a ref'd wrapper around `children`, so the FAB/sheet aren't in the shot). Best-effort:
    a capture failure still lets you file text-only.
  - The sheet is **keyboard-avoiding** (`KeyboardAvoidingView`) with a **tap-anywhere backdrop that
    dismisses the keyboard** (the multiline input has no return-to-dismiss).
  - `useSetReportScreen()` (a context hook) lets `Root`/`OnboardingGate` tag the current screen
    (`home`/`pod`/`prog`/`settings`/`session`/`onboarding`).
- **`src/services/supabase/SupabaseBugReportService.ts`** — `submit({ description, screen,
  screenshotBase64, appVersion, platform, osVersion })`: decodes the base64 PNG
  (`base64-arraybuffer`), uploads the **bytes** to `bug-screenshots/{userId}/{uuid}.png` (NOT
  `fetch(file://).blob()` — unreliable in RN), then inserts the `bug_reports` row. Screenshot upload
  is best-effort (text report still lands); only an insert error throws. Wired in
  `createSupabaseServices` as `services.bugReport`; `StubBugReportService` for tests.
- **UUIDs:** uses `src/services/uuid.ts` `randomUuid()` — NOT `crypto.randomUUID()`, which throws
  `ReferenceError: Property 'crypto' doesn't exist` in Hermes and silently broke every Storage
  upload. (Same helper used by the recordings uploader.)

## Backend (Supabase project `necfghfotwykjsykccsa`)

Migration **`supabase/migrations/0011_bug_reports.sql`**:
- Table `public.bug_reports`: `id, user_id (default auth.uid()), created_at, description, screen,
  app_version, platform, os_version, screenshot_path, extra jsonb, status (default 'open')`.
  RLS: authenticated users **insert/select their own rows only**.
- Private Storage bucket `bug-screenshots` + own-folder RLS (`{user_id}/...`).
- Triage reads use the **service-role MCP** (no broad select policy).

## How to triage reports (the recurring "check the log" task)

Query via the Supabase MCP (`execute_sql`, project `necfghfotwykjsykccsa`):

```sql
select to_char(created_at,'YYYY-MM-DD HH24:MI') as filed, screen, app_version, platform,
       description, (screenshot_path is not null) as has_screenshot, status
from bug_reports
order by created_at desc
limit 25;
```

A `has_screenshot=false` on a recent report is a red flag (capture/upload regressing).

**Screenshots** live in the private `bug-screenshots` bucket (`{user_id}/{uuid}.png`). The MCP can't
download bytes / sign URLs — to view one, create a signed URL from the Storage API (service role) or
the Supabase dashboard. In practice the text descriptions are detailed; ask the tester to paste a
`[bug-report] …` Metro warning if a screenshot is missing.

## Cloud monitor routine (auto-digest)

A scheduled cloud agent logs new reports every 2h (read-only): routine
`trig_011CPeyJkR7xgaiTi2mXJsKf` — "PocketPolyglot bug-report monitor"
(https://claude.ai/code/routines/trig_011CPeyJkR7xgaiTi2mXJsKf). Manage via the `schedule` skill /
`RemoteTrigger`. It selects `bug_reports` from the last ~130 min and prints a digest; flags
missing-screenshot reports.

## Test accounts & seeding

- **`test@pocketpolyglot.dev`** — the "full app" account.
- **`newuser@pocketpolyglot.dev`** — the fresh / seedable account.
- Both password **`Polyglot123!`** (created via raw SQL into `auth.users` + `auth.identities`; NB
  GoTrue needs the token columns `confirmation_token/recovery_token/email_change/
  email_change_token_new` set to `''` not NULL, else login → "Database error querying schema").
- **Reset to first-run:** `scripts/reset-new-user.sql` (clears `settings.seenDiacritics`, consent,
  `review_state`/`review_log`/`recordings`). NB the *account age* still counts — a >1-day-old account
  gets `STEADY_STATE_NEW_CAP=5` new, not the day-one 20.
- **Seed a "day N" state** (MCP `execute_sql`): insert `review_state` rows for the top-N
  `utility_rank` lemmas at `stage='review'` + a correct `review_log` each (so phrase anchors work),
  and set a **realistic FSRS due_at spread** — only a subset `due_at <= now()` today (NOT all due;
  the loop = new + FSRS-due-today only). Set `profiles.settings.seenDiacritics=true` to skip
  onboarding.

## Gotchas / notes

- Always-on (no gating flag) — it's an unpushed internal beta build; trivially gated later.
- On WSL2, run the app with `npm run phone` (Cloudflare tunnel; see `docs/PHONE_PREVIEW.md`). After a
  merge, **fully reload Expo Go** (close + rescan) — hot-refresh is unreliable across many changes.
- A stale `/tmp/cloudflared` can hang "starting tunnel"; `rm -f /tmp/cloudflared` to force a fresh
  download. Never `pkill -f cloudflared` on WSL2 (self-matches). Only one Metro per port 8081.

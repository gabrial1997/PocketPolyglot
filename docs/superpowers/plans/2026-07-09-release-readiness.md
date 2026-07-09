# Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the app to public-App-Store-submittable: podcast 25% lock screen, Apple-mandated account deletion, consent onboarding, Settings cleanup, EAS/store plumbing + runbook, GitHub Pages policy pages, and a full content text audit.

**Architecture:** All app work follows the existing Tier-B pattern — pure screens (props in / events out), hosts own fetch/state via injected services, `hostStates` for loading/error. DB changes ship as one new migration (0018) plus applying already-merged 0016/0017. The content audit (Task 10) is data work against the live DB + `words/` CSVs, independent of the app tasks.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / TypeScript, jest + @testing-library/react-native, Supabase (Postgres + Auth + Storage + RLS), EAS build, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-07-09-release-readiness-design.md` — binding. Read it first.

## Global Constraints

- Base branch: `main` @ `f2cd694`. All app tasks land on feature branch `feat/release-readiness`.
- Cards/screens stay PURE: no service imports in `src/screens/*Screen*.tsx` or the new locked screen; services only in hosts via `useServices()` (CLAUDE.md boundary).
- Brand copy: **no gamification, no time claims, never the literal word "quiet"** in user-facing copy. Coverage-framed progress only.
- Honest data (locked): fetch failure ⇒ retryable `HostError`; never silent defaults. Coverage fetch failure on the podcast gate ⇒ error state, **never unlocked** (fail-closed).
- `PODCAST_UNLOCK_COVERAGE = 0.25`; boundary: ratio `>= 0.25` unlocks (exactly 250/1000 known ⇒ unlocked).
- Support contact: single source `src/config/support.ts`. `SUPPORT_EMAIL` is a **placeholder pending GitHub issue #5** — mark it with a comment; never hard-code the address elsewhere.
- No audio generation anywhere in this plan (founder records native audio later).
- TDD; CI (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) green at every commit. Known env flake: `StartingLoop.test.tsx` under parallel jest workers — retry with `npm test -- --runInBand` before treating as real.
- TypeScript: no `any` in contracts.
- Test style: mirror the existing patterns — for pure screens copy the setup used in `src/screens/ProgressScreen.test.tsx`; for hosts copy `src/screens/ProgressHost.test.tsx` (fake service bundle via `ServiceProvider`, `ThemeProvider` wrapper). Reuse their render helpers; do not invent new harnesses.

## Execution notes (controller, before Task 1)

1. Create branch: `git checkout -b feat/release-readiness` (from `main` @ `f2cd694`).
2. Apply already-merged migrations **0016** (`supabase/migrations/0016_distractors_no_synonyms.sql`) and **0017** (`0017_coverage_denominator.sql`) to live Supabase project `necfghfotwykjsykccsa` via the Supabase MCP `apply_migration` (names: `distractors_no_synonyms`, `coverage_denominator`). Founder approval is carried by the spec; if the permission layer still prompts, surface it to the founder rather than skipping.
3. Task 10 (content audit) is independent of Tasks 1–9 and may run in parallel from the start.
4. Migration 0018 (Task 3) is applied live right after Task 3 passes review.

---

### Task 1: PodcastLockedScreen (pure)

**Files:**
- Create: `src/screens/PodcastLockedScreen.tsx`
- Test: `src/screens/PodcastLockedScreen.test.tsx`

**Interfaces:**
- Consumes: `Screen` from `../components`, `Eyebrow`, `CardIcon` from `../components/cardChrome`, `useTheme`, `fonts`/`type` tokens (same imports as `src/screens/PhraseLocked.tsx` — read it first; this screen mirrors its visual language).
- Produces: `export function PodcastLockedScreen({ pct, onKeepLearning }: PodcastLockedScreenProps)` with `export interface PodcastLockedScreenProps { /** Whole-number coverage percent, 0–24 while locked. */ pct: number; /** Navigates to the Today tab. Omitted ⇒ button hidden. */ onKeepLearning?: () => void }`. Task 2 renders this from `PodcastHost`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/PodcastLockedScreen.test.tsx
// Pure screen: renders locked copy from props only. Mirror the render helper used in
// src/screens/ProgressScreen.test.tsx (ThemeProvider wrapper).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PodcastLockedScreen } from './PodcastLockedScreen';
import { ThemeProvider } from '../theme/ThemeProvider';

function renderLocked(props: React.ComponentProps<typeof PodcastLockedScreen>) {
  return render(
    <ThemeProvider>
      <PodcastLockedScreen {...props} />
    </ThemeProvider>,
  );
}

describe('PodcastLockedScreen', () => {
  it('states the unlock condition and the current coverage', () => {
    const { getByText } = renderLocked({ pct: 12 });
    getByText('Podcasts unlock at 25%');
    getByText(/Episodes are built from words you already know/);
    getByText(/You can follow 12% of everyday speech so far\./);
  });

  it('renders 0% honestly for a brand-new learner', () => {
    const { getByText } = renderLocked({ pct: 0 });
    getByText(/You can follow 0% of everyday speech so far\./);
  });

  it('fires onKeepLearning; hides the action when the callback is absent', () => {
    const go = jest.fn();
    const { getByLabelText } = renderLocked({ pct: 5, onKeepLearning: go });
    fireEvent.press(getByLabelText('Keep learning'));
    expect(go).toHaveBeenCalledTimes(1);
    const { queryByLabelText } = renderLocked({ pct: 5 });
    expect(queryByLabelText('Keep learning')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/screens/PodcastLockedScreen.test.tsx`
Expected: FAIL — `Cannot find module './PodcastLockedScreen'`

- [ ] **Step 3: Write the screen**

```tsx
// src/screens/PodcastLockedScreen.tsx
// pod (locked) — Tier-B gate for the Listen tab (spec 2026-07-09 §1). Pure: data-in/events-out,
// no service imports. Visual language mirrors PhraseLocked (dimmed subject + quiet lock hint):
// locking must read as ONE system. Copy is coverage-framed and calm — no gamification, no time
// claims (locked brand rules).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components';
import { CardIcon, Eyebrow } from '../components/cardChrome';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, type } from '../theme/tokens';

export interface PodcastLockedScreenProps {
  /** Whole-number coverage percent (0–24 while locked). */
  pct: number;
  /** Navigates back to the Today tab. Omitted ⇒ the action is hidden. */
  onKeepLearning?: () => void;
}

export function PodcastLockedScreen({ pct, onKeepLearning }: PodcastLockedScreenProps): React.JSX.Element {
  const T = useTheme();
  return (
    <Screen>
      <View style={styles.head}>
        <Eyebrow>Listen</Eyebrow>
      </View>

      <View style={styles.body}>
        <View style={styles.hintRow}>
          <CardIcon name="lock" size={15} color={T.faint} />
          <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>
            Podcasts unlock at 25%
          </Text>
        </View>

        <Text style={[styles.copy, { color: T.sub }]}>
          Episodes are built from words you already know. Once you can follow a quarter of
          everyday speech, listening starts to make sense.
        </Text>

        <Text style={[styles.coverage, { color: T.faint }]}>
          You can follow {pct}% of everyday speech so far.
        </Text>
        {/* Same thin-track treatment as Home's coverage bar: track = hairline tint, fill = primary. */}
        <View style={[styles.track, { backgroundColor: T.hair }]}>
          <View
            style={[styles.fill, { backgroundColor: T.primary, width: `${Math.min(100, Math.max(0, pct))}%` }]}
          />
        </View>
      </View>

      {onKeepLearning ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep learning"
          onPress={onKeepLearning}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: T.faint }]}>Keep learning</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 6, alignItems: 'flex-start' },
  body: { flex: 1, justifyContent: 'center', paddingBottom: 60, rowGap: 14 },
  hintRow: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  title: { fontSize: 26, letterSpacing: -0.2 },
  copy: { fontSize: type.body, lineHeight: 23, maxWidth: 320 },
  coverage: { fontSize: 13.5, marginTop: 10 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: 4, borderRadius: 2 },
  action: { paddingBottom: 30, paddingTop: 8, alignItems: 'center' },
  actionText: { fontSize: 14.5, fontWeight: '600' },
});
```

Adjust only if `Eyebrow`/`CardIcon`/token names differ on disk — mirror `PhraseLocked.tsx` exactly for imports; do not restyle beyond what the test pins.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/screens/PodcastLockedScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint/typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/screens/PodcastLockedScreen.tsx src/screens/PodcastLockedScreen.test.tsx
git commit -m "feat(pod): PodcastLockedScreen — coverage-framed 25% gate (pure)"
```

---

### Task 2: Podcast gate — constant, host state, tab wiring

**Files:**
- Create: `src/screens/podcastGate.ts`, `src/screens/podcastGate.test.ts`
- Modify: `src/screens/PodcastHost.tsx` (whole state machine), `src/navigation/index.tsx:325` (pass `onKeepLearning`)
- Test: `src/screens/PodcastHost.test.tsx` (extend; create if absent, mirroring `ProgressHost.test.tsx`)

**Interfaces:**
- Consumes: `PodcastLockedScreen` + `PodcastLockedScreenProps` (Task 1); `ProgressService.getCoverage(): Promise<ProgressCoverage>` where `ProgressCoverage = { total: number; knownRanks: number[] }` (`src/services/index.ts:47-57`); `HostLoading`/`HostError` (`src/screens/hostStates.tsx`).
- Produces: `export const PODCAST_UNLOCK_COVERAGE = 0.25` and `export function podcastLocked(cov: ProgressCoverage): boolean` from `podcastGate.ts`; `PodcastHost` prop `onKeepLearning?: () => void`. Task 8's checklist references the dev route to exercising both sides of the gate.

- [ ] **Step 1: Write the failing gate-math tests**

```ts
// src/screens/podcastGate.test.ts
import { PODCAST_UNLOCK_COVERAGE, podcastLocked } from './podcastGate';

const cov = (known: number, total = 1000) => ({ total, knownRanks: Array.from({ length: known }, (_, i) => i + 1) });

describe('podcastLocked', () => {
  it('locks below 25%', () => {
    expect(podcastLocked(cov(0))).toBe(true);
    expect(podcastLocked(cov(249))).toBe(true);
  });
  it('unlocks at exactly 25% and above (boundary is >=)', () => {
    expect(podcastLocked(cov(250))).toBe(false);
    expect(podcastLocked(cov(1000))).toBe(false);
  });
  it('never divides by zero — an empty corpus stays locked', () => {
    expect(podcastLocked({ total: 0, knownRanks: [] })).toBe(true);
  });
  it('exposes the threshold as a single named constant', () => {
    expect(PODCAST_UNLOCK_COVERAGE).toBe(0.25);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/screens/podcastGate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the gate module**

```ts
// src/screens/podcastGate.ts
// Podcast unlock gate (spec 2026-07-09 §1). One named threshold, one pure predicate — the host
// and any future surface (Home teaser, notifications) must share THIS math, never re-derive it.
import type { ProgressCoverage } from '../services';

/** Coverage ratio at which the Listen tab unlocks. Boundary: >= unlocks (250/1000 ⇒ open). */
export const PODCAST_UNLOCK_COVERAGE = 0.25;

/** True while the learner's coverage is below the unlock threshold. Empty corpus ⇒ locked. */
export function podcastLocked(cov: ProgressCoverage): boolean {
  if (cov.total <= 0) return true;
  return cov.knownRanks.length / cov.total < PODCAST_UNLOCK_COVERAGE;
}
```

- [ ] **Step 4: Run gate tests — PASS**

Run: `npm test -- src/screens/podcastGate.test.ts` → PASS (4 tests)

- [ ] **Step 5: Write the failing host tests**

Extend/create `src/screens/PodcastHost.test.tsx`, mirroring `ProgressHost.test.tsx`'s fake-bundle setup (fake `ServiceProvider` bundle + `ThemeProvider`). The fake bundle's `progress.getCoverage` and `podcast.getEpisode` are jest mocks per test:

```tsx
it('renders the locked screen below 25% and never fetches the episode', async () => {
  progress.getCoverage.mockResolvedValue({ total: 1000, knownRanks: ranks(100) }); // 10%
  const { findByText } = renderHost();
  await findByText('Podcasts unlock at 25%');
  await findByText(/You can follow 10% of everyday speech so far\./);
  expect(podcast.getEpisode).not.toHaveBeenCalled();
});

it('unlocks at exactly 250/1000 and shows the ready flow', async () => {
  progress.getCoverage.mockResolvedValue({ total: 1000, knownRanks: ranks(250) });
  podcast.getEpisode.mockResolvedValue({ title: '', transcript: '', audioUrl: '' });
  const { findByText } = renderHost();
  await findByText(/No episode yet/); // the honest empty state — episode fetch DID run
  expect(podcast.getEpisode).toHaveBeenCalledTimes(1);
});

it('fail-closed: coverage fetch error shows retryable HostError, not the unlocked flow', async () => {
  progress.getCoverage.mockRejectedValue(new Error('down'));
  const { findByText } = renderHost();
  await findByText(/Couldn’t load this right now/);
  expect(podcast.getEpisode).not.toHaveBeenCalled();
});

it('retry after coverage error refetches', async () => {
  progress.getCoverage.mockRejectedValueOnce(new Error('down'));
  progress.getCoverage.mockResolvedValueOnce({ total: 1000, knownRanks: ranks(300) });
  podcast.getEpisode.mockResolvedValue({ title: '', transcript: '', audioUrl: '' });
  const { findByText, getByText } = renderHost();
  await findByText(/Couldn’t load this right now/);
  fireEvent.press(getByText('Try again'));
  await findByText(/No episode yet/);
});
```

(`ranks(n)` = `Array.from({length:n},(_,i)=>i+1)`; keep existing episode-flow tests passing.)

- [ ] **Step 6: Run to verify the new tests fail**

Run: `npm test -- src/screens/PodcastHost.test.tsx` → new tests FAIL (locked copy never rendered)

- [ ] **Step 7: Rewrite PodcastHost's state machine**

Replace the `State` union and effect in `src/screens/PodcastHost.tsx` (keep `toLines` and the ready render unchanged):

```tsx
import { PodcastLockedScreen } from './PodcastLockedScreen';
import { podcastLocked } from './podcastGate';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'locked'; pct: number }
  | { status: 'ready'; ep: Episode | null };

export function PodcastHost({ onKeepLearning }: { onKeepLearning?: () => void } = {}): React.JSX.Element {
  const { podcast, audio, progress } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    // Coverage decides the gate BEFORE any episode fetch (spec §1: locked ⇒ skip it entirely).
    progress
      .getCoverage()
      .then((cov) => {
        if (!alive) return undefined;
        if (podcastLocked(cov)) {
          const pct = cov.total > 0 ? Math.round((cov.knownRanks.length / cov.total) * 100) : 0;
          setState({ status: 'locked', pct });
          return undefined;
        }
        return podcast.getEpisode().then((e) => {
          if (alive) setState({ status: 'ready', ep: e.title && e.audioUrl ? e : null });
        });
      })
      .catch(() => {
        // Fail-closed: no coverage answer never means unlocked — and never a silent default.
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [podcast, progress, attempt]);

  if (state.status === 'loading') return <HostLoading />;
  if (state.status === 'error') return <HostError onRetry={() => setAttempt((a) => a + 1)} />;
  if (state.status === 'locked') return <PodcastLockedScreen pct={state.pct} onKeepLearning={onKeepLearning} />;
  // ...existing ready render unchanged
```

Wire navigation (`src/navigation/index.tsx:325`):

```tsx
{route === 'pod' ? <PodcastHost onKeepLearning={() => setRoute('home')} /> : null}
```

- [ ] **Step 8: Full suite + commit**

Run: `npm test` → all green (`--runInBand` on StartingLoop flake). `npm run lint && npm run typecheck`.

```bash
git add src/screens/podcastGate.ts src/screens/podcastGate.test.ts src/screens/PodcastHost.tsx src/screens/PodcastHost.test.tsx src/navigation/index.tsx
git commit -m "feat(pod): lock the Listen tab below 25% coverage — fail-closed gate, Keep-learning exit"
```

---

### Task 3: Migration 0018 + `ProfileService.deleteAccount()`

**Files:**
- Create: `supabase/migrations/0018_delete_account.sql`
- Modify: `src/services/index.ts` (`ProfileService` interface), `src/services/supabase/SupabaseProfileService.ts`, `src/services/stubs.ts` (stub bundle must satisfy the widened interface)
- Test: `src/services/supabase/SupabaseProfileService.test.ts` (extend)

**Interfaces:**
- Consumes: existing `SupabaseProfileService` fake-client test pattern (its test file already fakes list selects for `deleteRecordings`).
- Produces: `deleteAccount(): Promise<void>` on `ProfileService` — calls the `delete_account` RPC and throws on `{ error }`. Task 4's host calls `profile.deleteRecordings()` **then** `profile.deleteAccount()` then `signOut()`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0018_delete_account.sql
-- 0018: Apple-mandated in-app account deletion (spec 2026-07-09 §2a). One SECURITY DEFINER RPC,
-- self-targeting ONLY (auth.uid()), no parameters — a caller can never delete anyone else.
-- Every user-owned public table (profiles 0001:202, recordings 0001:218, review_state 0001:243,
-- review_log 0001:269, bug_reports 0011:4) references auth.users ON DELETE CASCADE, so deleting
-- the auth user removes all rows. The client removes recording OBJECTS via the storage API first
-- (SupabaseProfileService.deleteRecordings); the storage.objects delete below is belt-and-braces
-- for anything that slipped past it (bucket layout: `${userId}/...`).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'delete_account: not authenticated';
  end if;
  delete from storage.objects
    where bucket_id = 'recordings' and name like auth.uid()::text || '/%';
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
```

- [ ] **Step 2: Write the failing service tests**

Extend `src/services/supabase/SupabaseProfileService.test.ts` — add an `rpc` jest mock to the existing fake client (resolve-with-`{ error }` semantics, supabase-js `rpc()` never rejects):

```ts
it('deleteAccount calls the self-targeting RPC', async () => {
  client.rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  await svc.deleteAccount();
  expect(client.rpc).toHaveBeenCalledWith('delete_account');
});

it('deleteAccount surfaces an RPC error (never a silent partial delete)', async () => {
  client.rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
  await expect(svc.deleteAccount()).rejects.toBeTruthy();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/services/supabase/SupabaseProfileService.test.ts`
Expected: FAIL — `svc.deleteAccount is not a function`

- [ ] **Step 4: Implement**

`src/services/index.ts` — add to `ProfileService` (after `setConsent`):

```ts
  /** Apple-mandated account deletion: removes the auth user (all user rows cascade) via the
   *  self-targeting delete_account RPC (migration 0018). Call deleteRecordings() FIRST so the
   *  audio objects are removed through the storage API. Throws on failure. */
  deleteAccount(): Promise<void>;
```

`src/services/supabase/SupabaseProfileService.ts`:

```ts
  async deleteAccount(): Promise<void> {
    const { error } = await this.client.rpc('delete_account');
    if (error) throw error;
  }
```

`src/services/stubs.ts` — add `deleteAccount: async () => {}` to the stub profile service (match the file's existing stub style).

- [ ] **Step 5: Run tests — PASS; typecheck catches any missed implementor of `ProfileService`**

Run: `npm test -- src/services/supabase/SupabaseProfileService.test.ts && npm run typecheck` → PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0018_delete_account.sql src/services/index.ts src/services/supabase/SupabaseProfileService.ts src/services/stubs.ts src/services/supabase/SupabaseProfileService.test.ts
git commit -m "feat(gdpr): delete_account RPC (0018) + ProfileService.deleteAccount"
```

**Controller note:** after this task's review passes, apply 0018 live (`apply_migration`, name `delete_account`) and verify with `select proname, prosecdef from pg_proc where proname = 'delete_account'` → `prosecdef = true`.

---

### Task 4: Delete-account row in Settings

**Files:**
- Modify: `src/screens/SettingsScreen.tsx` (Security group, `ProfileSettings` sub-screen, props), `src/screens/SettingsHost.tsx`
- Test: `src/screens/SettingsScreen.test.tsx`, `src/screens/SettingsHost.test.tsx` (extend both; mirror existing tests in those files)

**Interfaces:**
- Consumes: `profile.deleteRecordings()`, `profile.deleteAccount()` (Task 3), `signOut` from `useAuth()`.
- Produces: `SettingsScreenProps` gains `onDeleteAccount: () => void` and `deleteAccountError?: boolean`.

- [ ] **Step 1: Write the failing screen tests**

The row lives in the Security group of the Profile sub-screen and uses the DevSection arm/disarm pattern (`SettingsScreen.tsx:337-377`): first tap arms with explicit copy, 4s timeout disarms, second tap confirms.

```tsx
it('delete account requires a second, armed tap', () => {
  const onDeleteAccount = jest.fn();
  const s = renderSettings({ onDeleteAccount }); // open Profile sub-screen first (press "Open profile")
  fireEvent.press(s.getByText('Delete account'));
  expect(onDeleteAccount).not.toHaveBeenCalled();
  fireEvent.press(s.getByText('Tap again to permanently delete your account'));
  expect(onDeleteAccount).toHaveBeenCalledTimes(1);
});

it('disarms after the timeout', () => {
  jest.useFakeTimers();
  const s = renderSettings({ onDeleteAccount: jest.fn() });
  fireEvent.press(s.getByText('Delete account'));
  act(() => jest.advanceTimersByTime(4001));
  s.getByText('Delete account'); // back to unarmed label
  jest.useRealTimers();
});

it('surfaces a failed deletion as a retryable row', () => {
  const s = renderSettings({ deleteAccountError: true });
  s.getByText('Deletion failed — tap to retry');
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/screens/SettingsScreen.test.tsx` → FAIL

- [ ] **Step 3: Implement screen**

Add to `SettingsScreenProps`:

```ts
  /** Two-tap-confirmed, Apple-mandated account deletion. Host: deleteRecordings → deleteAccount → signOut. */
  onDeleteAccount: () => void;
  /** Last deleteAccount attempt failed — row becomes a retry (never a silent partial delete). */
  deleteAccountError?: boolean;
```

In `ProfileSettings`, extract the arm/disarm logic into a small local component (same shape as `DevSection`'s armed state) and extend the Security card:

```tsx
<SettGroupLabel>Security</SettGroupLabel>
<SettCard>
  <SettRow icon="shield" title="Change password" chevron={false} />
  <ArmedDeleteRow
    armedTitle="Tap again to permanently delete your account"
    idleTitle={props.deleteAccountError ? 'Deletion failed — tap to retry' : 'Delete account'}
    onConfirm={props.onDeleteAccount}
    isLast
  />
</SettCard>
```

```tsx
// Local to SettingsScreen.tsx — the DevSection arm/disarm pattern, reused for account deletion.
function ArmedDeleteRow({ idleTitle, armedTitle, onConfirm, isLast }: {
  idleTitle: string; armedTitle: string; onConfirm: () => void; isLast?: boolean;
}): React.JSX.Element {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <SettRow
      icon="trash"
      title={armed ? armedTitle : idleTitle}
      danger
      chevron={false}
      isLast={isLast}
      onPress={() => {
        if (armed) { setArmed(false); onConfirm(); } else { setArmed(true); }
      }}
    />
  );
}
```

(Keep the "Change password" row exactly as-is in this task — Task 6 wires it.)

- [ ] **Step 4: Screen tests PASS** — `npm test -- src/screens/SettingsScreen.test.tsx`

- [ ] **Step 5: Write failing host test, then wire the host**

Host test: mock `profile.deleteRecordings`/`profile.deleteAccount` and auth `signOut`; assert order (recordings → account → signOut) and that a rejection sets the error prop instead of signing out.

`SettingsHost.tsx`:

```tsx
const [deleteAccountError, setDeleteAccountError] = useState(false);
// ...
onDeleteAccount={() => {
  void (async () => {
    try {
      await profile.deleteRecordings(); // audio objects via the storage API first
      await profile.deleteAccount();    // auth user + cascaded rows (0018)
      setDeleteAccountError(false);
      await signOut();                  // local session teardown → auth screen
    } catch {
      setDeleteAccountError(true);
    }
  })();
}}
deleteAccountError={deleteAccountError}
```

- [ ] **Step 6: Full suite + commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/screens/SettingsScreen.tsx src/screens/SettingsHost.tsx src/screens/SettingsScreen.test.tsx src/screens/SettingsHost.test.tsx
git commit -m "feat(gdpr): two-tap Delete account in Settings — recordings, account, sign-out"
```

---

### Task 5: Consent step in onboarding

**Files:**
- Modify: `src/onboarding/OnboardingGate.tsx`, `src/services/index.ts` (`ProfileSnapshot` + `ProfileService`), `src/services/supabase/SupabaseProfileService.ts`, `src/services/stubs.ts`
- Test: `src/onboarding/OnboardingGate.test.tsx`, `src/services/supabase/SupabaseProfileService.test.ts` (extend both)

**Interfaces:**
- Consumes: `ConsentScreen` (`src/screens/ConsentScreen.tsx` — exists, props `onAccept({ training })` / `onDecline`), `profile.setConsent({ rec, training })` (exists).
- Produces: `ProfileSnapshot` gains `seenConsent: boolean` (from `settings.seenConsent === true`); `ProfileService` gains `setSeenConsent(): Promise<void>` (settings-merge, exactly the `setSeenDiacritics` pattern at `SupabaseProfileService.ts:87-106`). Gate order: `loading → orientation (if !seenDiacritics) → consent (if !seenConsent) → done`.

- [ ] **Step 1: Failing service tests** — mirror the existing `setSeenDiacritics` tests: `setSeenConsent()` merges `{ seenConsent: true }` into `settings` without clobbering other keys; `getProfile()` maps `settings.seenConsent === true` → `seenConsent`.

- [ ] **Step 2: Run to verify failure**, then implement:

```ts
// getProfile(): add to the returned snapshot
seenConsent: row.settings?.seenConsent === true,
```

```ts
  async setSeenConsent(): Promise<void> {
    // Same read-modify-write settings merge as setSeenDiacritics (single-user build; preserves
    // settings.editor and seenDiacritics).
    const { data: readData, error: readError } = await this.client
      .from('profiles')
      .select('settings')
      .eq('id', this.userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!readData) {
      throw new Error('setSeenConsent: no profile row for user; call ensureProfile() first');
    }
    const current = (readData as { settings: Record<string, unknown> | null }).settings ?? {};
    const { error: writeError } = await this.client
      .from('profiles')
      .update({ settings: { ...current, seenConsent: true } })
      .eq('id', this.userId);
    if (writeError) throw writeError;
  }
```

Interface additions in `src/services/index.ts` (with doc comments in the file's style); stub gets `setSeenConsent: async () => {}` and `seenConsent: true` in any stub snapshot.

- [ ] **Step 3: Failing gate tests** — extend `OnboardingGate.test.tsx`:

```tsx
it('shows consent once after orientation for a brand-new user', async () => { /* snap: null → orientation → dismiss → consent screen visible */ });
it('shows consent directly for a returning user who has not decided', async () => { /* snap: { seenDiacritics: true, seenConsent: false } → consent */ });
it('accept writes setConsent({rec:true, training}) + setSeenConsent and advances', async () => { /* press "Allow recording" */ });
it('decline marks seenConsent only (rec stays default-off) and advances', async () => { /* press "Not now"; expect setConsent NOT called */ });
it('skips consent for a user who already decided', async () => { /* snap: { seenConsent: true } → children immediately */ });
```

Write these as real tests following the file's existing fake-profile pattern.

- [ ] **Step 4: Implement the gate step**

`OnboardingGate.tsx` — state machine gains `'consent'`; the snapshot is kept so orientation's dismiss knows where to go:

```tsx
type GateState = 'loading' | 'orientation' | 'consent' | 'done';
// in init(): const next = !snap || !snap.seenDiacritics ? 'orientation' : !snap.seenConsent ? 'consent' : 'done';
//            setSeenConsentNeeded(!snap || !snap.seenConsent); setState(next);
// orientation onDismiss: void profile.setSeenDiacritics(); setState(seenConsentNeeded ? 'consent' : 'done');
```

```tsx
if (state === 'consent') {
  return (
    <ConsentScreen
      onAccept={({ training }) => {
        // Fire-and-forget like the diacritics flag — never strand the learner on a slow write.
        void profile.setConsent({ rec: true, training });
        void profile.setSeenConsent();
        setState('done');
      }}
      onDecline={() => {
        // rec_consent stays default-off (fail-closed); we only record that they decided.
        void profile.setSeenConsent();
        setState('done');
      }}
    />
  );
}
```

Error posture unchanged: any `init()` failure still advances to `'done'` (consent stays fail-closed off).

- [ ] **Step 5: Full suite + commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/onboarding/OnboardingGate.tsx src/onboarding/OnboardingGate.test.tsx src/services/index.ts src/services/supabase/SupabaseProfileService.ts src/services/supabase/SupabaseProfileService.test.ts src/services/stubs.ts
git commit -m "feat(gdpr): consent explainer as a one-time onboarding step (seenConsent flag)"
```

---

### Task 6: Settings cleanup — dead rows become real or disappear

**Files:**
- Create: `src/config/support.ts`
- Modify: `src/screens/SettingsScreen.tsx`, `src/screens/SettingsHost.tsx`
- Test: `src/screens/SettingsScreen.test.tsx`, `src/screens/SettingsHost.test.tsx`

**Interfaces:**
- Consumes: `Linking` from `react-native`; `supabase.auth.resetPasswordForEmail(email)` (host-side; `supabase` is already imported in `SettingsHost.tsx:9`).
- Produces: `src/config/support.ts` exporting `SUPPORT_EMAIL`, `SUPPORT_URL`, `PRIVACY_URL` (Task 9 publishes pages at these URLs; keep them consistent). `SettingsScreenProps` gains `onContactSupport: () => void`, `onOpenPrivacy: () => void`, `onOpenSupportSite: () => void`, `onChangePassword: () => void`, `passwordResetState: 'idle' | 'sent' | 'error'`.

- [ ] **Step 1: Create the single-source support config**

```ts
// src/config/support.ts
// Single source for the public support/privacy contact + URLs (spec 2026-07-09 §2c/§4).
// SUPPORT_EMAIL is a PLACEHOLDER — the real address is tracked in GitHub issue #5; swap it
// here (and republish the gh-pages pages) before `eas submit`. Never hard-code it elsewhere.
export const SUPPORT_EMAIL = 'REPLACE-ME-issue-5@pocketpolyglot.app';
export const SUPPORT_URL = 'https://gabrial1997.github.io/PocketPolyglot/';
export const PRIVACY_URL = 'https://gabrial1997.github.io/PocketPolyglot/privacy.html';
```

- [ ] **Step 2: Failing screen tests**

```tsx
it('has no Notifications toggle and no Change photo affordance', () => {
  const s = renderSettings({});
  expect(s.queryByText('Notifications')).toBeNull();
  // open Profile sub-screen
  fireEvent.press(s.getByLabelText('Open profile'));
  expect(s.queryByText('Change photo')).toBeNull();
});

it('Help & feedback and policy rows fire their callbacks', () => {
  const onContactSupport = jest.fn(); const onOpenPrivacy = jest.fn();
  const s = renderSettings({ onContactSupport, onOpenPrivacy });
  fireEvent.press(s.getByText('Help & feedback'));
  expect(onContactSupport).toHaveBeenCalled();
  fireEvent.press(s.getByText('Privacy policy'));
  expect(onOpenPrivacy).toHaveBeenCalled();
});

it('Change password fires and reflects the sent/error states', () => {
  const onChangePassword = jest.fn();
  let s = renderSettings({ onChangePassword, passwordResetState: 'idle' });
  fireEvent.press(s.getByText('Change password'));
  expect(onChangePassword).toHaveBeenCalled();
  s = renderSettings({ passwordResetState: 'sent' });
  s.getByText(/Check your email/);
  s = renderSettings({ passwordResetState: 'error' });
  s.getByText(/Couldn’t send/);
});
```

- [ ] **Step 3: Implement screen changes**

- Delete the `notif` state (`SettingsScreen.tsx:61`), the `onToggleNotif` plumbing, and the Notifications `SettRow` (`:144-149`) — Appearance becomes the group's only row (`isLast`).
- Delete the "Change photo" `Text` (`:203`) and its style.
- Support group becomes:

```tsx
<SettGroupLabel>Support</SettGroupLabel>
<SettCard>
  <SettRow icon="help" title="Help & feedback" chevron={false} onPress={props.onContactSupport} />
  <SettRow icon="shield" title="Privacy policy" chevron={false} onPress={props.onOpenPrivacy} />
  <SettRow icon="globe" title="Support site" chevron={false} onPress={props.onOpenSupportSite} />
  <SettRow icon="info" title="About" value={`v${props.appVersion}`} chevron={false} isLast />
</SettCard>
```

- Security group's password row (Profile sub-screen):

```tsx
<SettRow
  icon="shield"
  title={
    props.passwordResetState === 'sent'
      ? 'Check your email for a reset link'
      : props.passwordResetState === 'error'
        ? 'Couldn’t send — tap to retry'
        : 'Change password'
  }
  chevron={false}
  onPress={props.onChangePassword}
/>
```

- [ ] **Step 4: Wire the host**

```tsx
import { Linking } from 'react-native';
import { SUPPORT_EMAIL, SUPPORT_URL, PRIVACY_URL } from '../config/support';
// ...
const [passwordResetState, setPasswordResetState] = useState<'idle' | 'sent' | 'error'>('idle');
// ...
onContactSupport={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }}
onOpenPrivacy={() => { void Linking.openURL(PRIVACY_URL); }}
onOpenSupportSite={() => { void Linking.openURL(SUPPORT_URL); }}
onChangePassword={() => {
  const email = user?.email;
  if (!email) return;
  supabase.auth
    .resetPasswordForEmail(email)
    .then(({ error }) => setPasswordResetState(error ? 'error' : 'sent'))
    .catch(() => setPasswordResetState('error'));
}}
passwordResetState={passwordResetState}
```

Host test: mock `Linking.openURL` (jest.spyOn) + a fake `supabase.auth.resetPasswordForEmail`; assert mailto contains `SUPPORT_EMAIL`, and sent/error state transitions.

- [ ] **Step 5: Full suite + commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/config/support.ts src/screens/SettingsScreen.tsx src/screens/SettingsHost.tsx src/screens/SettingsScreen.test.tsx src/screens/SettingsHost.test.tsx
git commit -m "feat(settings): real Help/Privacy/password rows; drop dead photo + notifications"
```

---

### Task 7: Store plumbing — eas.json, app.config, icon + splash

**Files:**
- Create: `eas.json`, `assets/icon.svg`, `assets/splash.svg`, `scripts/render-assets.mjs` (renders `assets/icon.png`, `assets/splash.png` — PNGs are committed)
- Modify: `app.config.ts`, `package.json` (devDependency `sharp`, dependency `expo-splash-screen`, script `assets`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the build config Task 8's runbook references (`eas build -p ios --profile production`).

- [ ] **Step 1: Install deps**

```bash
npx expo install expo-splash-screen
npm install --save-dev sharp
```

- [ ] **Step 2: Author the assets**

`assets/icon.svg` — restrained, brand-true (cream field, ink serif "ā" — the macron is the app's most Latvian glyph; no gloss, no gradient):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#F6F1E7"/>
  <text x="512" y="700" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="560" fill="#1A1E24">ā</text>
</svg>
```

`assets/splash.svg` (rendered as a contained image on a solid background set in app.config):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <text x="600" y="640" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="340" fill="#1A1E24">ā</text>
  <text x="600" y="780" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="64" fill="#6B7280">PocketPolyglot</text>
</svg>
```

`scripts/render-assets.mjs`:

```js
// Renders the committed PNG app assets from their SVG sources. Re-run after editing the SVGs:
//   npm run assets
import sharp from 'sharp';

await sharp('assets/icon.svg', { density: 300 }).resize(1024, 1024).png().toFile('assets/icon.png');
await sharp('assets/splash.svg', { density: 300 }).resize(1200, 1200).png().toFile('assets/splash.png');
console.log('rendered assets/icon.png (1024×1024) + assets/splash.png (1200×1200)');
```

`package.json` scripts: `"assets": "node scripts/render-assets.mjs"`. Run `npm run assets`; commit the PNGs. **Visually inspect both PNGs (open the files) before committing** — a blank or clipped glyph means the SVG font fallback failed; adjust `font-family` until the serif renders.

- [ ] **Step 3: eas.json**

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

- [ ] **Step 4: app.config.ts additions**

```ts
const config: ExpoConfig = {
  name: 'PocketPolyglot',
  slug: 'pocketpolyglot',
  version: '0.1.2',
  orientation: 'portrait',
  scheme: 'pocketpolyglot',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.pocketpolyglot.app',
    buildNumber: '1',
    infoPlist: {
      // App-Review-facing: plain language, matches the consent screen's promise.
      NSMicrophoneUsageDescription:
        'PocketPolyglot records your voice only when you practice pronunciation, so you can compare your attempt with a native speaker.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.pocketpolyglot.app',
  },
  plugins: [
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#F6F1E7',
        dark: { backgroundColor: '#0E1116' },
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};
```

- [ ] **Step 5: Verify**

Run: `npx expo config --type public | head -40` → shows icon, buildNumber, infoPlist, splash plugin with no errors. Note: with `appVersionSource: "remote"` EAS manages the store buildNumber remotely at build time; the `ios.buildNumber: '1'` in config is the local baseline and never needs hand-bumping. Then the full CI quartet (`npm run lint && npm run typecheck && npm test && npm run build`).

- [ ] **Step 6: Commit**

```bash
git add eas.json app.config.ts assets/ scripts/render-assets.mjs package.json package-lock.json
git commit -m "feat(release): EAS profiles, app icon + splash, mic permission string, build number"
```

---

### Task 8: Release runbook + on-device checklist

**Files:**
- Create: `docs/RELEASE_RUNBOOK.md`, `docs/RELEASE_ONDEVICE_CHECKLIST.md`

**Interfaces:**
- Consumes: Task 7's config (`eas build -p ios --profile production`), Task 9's published URLs, `src/config/support.ts`, issue #5.
- Produces: the founder-facing procedure; no code.

- [ ] **Step 1: Write `docs/RELEASE_RUNBOOK.md`**

Ordered sections, founder-credential steps marked **YOU**. Must contain, concretely (no placeholders except the issue-#5 email):

1. **Prereqs (YOU):** Apple Developer Program enrollment ($99/yr, developer.apple.com); Expo account + `npm i -g eas-cli` + `eas login`; resolve issue #5 (support email) → update `src/config/support.ts` + republish gh-pages pages.
2. **Version bump:** set `version: '1.0.0'` in `app.config.ts` and `package.json`; commit.
3. **Build:** `eas build -p ios --profile production` (first run walks through Apple credentials/certificates — accept EAS-managed defaults).
4. **TestFlight sanity (YOU):** `eas submit -p ios` → App Store Connect → TestFlight; run `docs/RELEASE_ONDEVICE_CHECKLIST.md` on a real device from the TestFlight build.
5. **App Store Connect metadata** — paste-ready drafts the writer of this task must compose in the runbook:
   - App name: PocketPolyglot. Subtitle (30 chars max): draft "The first 1,000 Latvian words".
   - Description (~2–3 paragraphs, brand voice: coverage-framed, no time claims, no "quiet"): what the app is (hear/choose/say practice over the 1,000 most common Latvian words), the honest-progress framing, pronunciation self-compare with consent.
   - Keywords draft: `latvian,latvia,language,learn latvian,vocabulary,pronunciation,flashcards,srs`.
   - Support URL / Privacy Policy URL: the Task 9 URLs (`SUPPORT_URL`, `PRIVACY_URL` values).
   - Age rating: 4+. Category: Education.
   - **App Privacy (nutrition labels)** — declare: Contact Info: email (account); User Content: audio (voice recordings, only with consent, linked to user, not used for tracking); Identifiers: user ID; Usage Data: none; no third-party tracking, no ads.
   - Review notes draft: test account credentials (founder supplies at submit time), note that recording features require the in-app consent toggle, note the Listen tab is locked below 25% coverage by design (reviewer can use the provided seeded account that is ≥25%).
6. **Submit for review (YOU):** `eas submit`, answer export compliance = already declared in config, submit.
7. **After approval:** release manually or auto; tag `v1.0.0` in git.

- [ ] **Step 2: Write `docs/RELEASE_ONDEVICE_CHECKLIST.md`**

Real checklist (checkbox per line) covering, at minimum: fresh sign-up → diacritics screen → **consent screen appears once** (accept path AND decline path on two accounts); Listen tab shows **lock screen with live %** below 25%; dev skip-day/seeding route to push a test account ≥25% (reference Settings → Developer, dev builds only) → Listen shows "No episode yet"; coverage-error path (airplane mode) shows retryable error, not unlock; Settings: Help & feedback opens mail, Privacy policy/Support site open pages, Change password sends the reset email (check inbox), Delete recordings works, **Delete account** two-tap → signed out → old credentials fail; sign-up again works; light + dark theme pass; audio-less phrase cards render silently; bug-reporter FAB works.

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASE_RUNBOOK.md docs/RELEASE_ONDEVICE_CHECKLIST.md
git commit -m "docs(release): App Store runbook + on-device checklist"
```

---

### Task 9: GitHub Pages — privacy policy + support page

**Files:**
- Create (on a **new orphan `gh-pages` branch**, NOT on the feature branch): `index.html` (support), `privacy.html`
- This task pushes to `origin gh-pages` and enables Pages. It does not touch app code.

**Interfaces:**
- Consumes: `SUPPORT_EMAIL` placeholder policy (issue #5); URL contract from `src/config/support.ts` (Task 6): site root = support page, `/privacy.html` = policy.
- Produces: live URLs `https://gabrial1997.github.io/PocketPolyglot/` and `.../privacy.html`.

- [ ] **Step 1: Create the orphan branch in a scratch worktree**

```bash
git worktree add /tmp/pp-gh-pages --detach
cd /tmp/pp-gh-pages && git checkout --orphan gh-pages && git rm -rf . 2>/dev/null
```

- [ ] **Step 2: Write the two pages**

Both pages: single-file HTML, inline CSS, no JS, no external assets; calm serif styling consistent with the brand (cream `#F6F1E7` background, ink `#1A1E24` text, max-width 640px, Georgia/serif). Shared header "PocketPolyglot".

`privacy.html` must cover, in plain English, each with its own heading: **What we collect** (account email; learning progress; voice recordings only with explicit in-app consent); **Voice recordings** (stored privately, kept over time to show pronunciation progress, a human reviewer may listen to samples to improve the app, never shared publicly, optional separate model-training consent, off by default); **Where data lives** (Supabase as processor; EU-region hosting statement verified against the actual project region before writing); **Your rights (GDPR)** (in-app: delete recordings, delete account entirely — Settings → Profile; both remove data permanently; also contact us); **Retention** (deleted on account deletion; recordings deletable independently anytime); **Contact** (the support email — placeholder marked `<!-- issue #5 -->` until resolved); **Changes** (dated changelog, starts at 2026-07-09).

`index.html` (support): what the app is (one paragraph); FAQ — consent & recording (how to enable/disable), deleting your data, why the Listen tab is locked ("Podcasts unlock once you can follow 25% of everyday speech"), how to report a bug (in-app 🐞 button); contact email (same placeholder). Footer links each page to the other.

- [ ] **Step 3: Push and enable Pages**

```bash
git add index.html privacy.html && git commit -m "pages: privacy policy + support"
git push origin gh-pages
# then, from any checkout (uses GITHUB_API_TOKEN from workspace-root .env):
gh api -X POST /repos/gabrial1997/PocketPolyglot/pages -f build_type=legacy -f "source[branch]=gh-pages" -f "source[path]=/" 
curl -sI https://gabrial1997.github.io/PocketPolyglot/ | head -1   # expect 200 (may take ~1 min)
git worktree remove /tmp/pp-gh-pages
```

If the Pages API returns 409 (already enabled), verify with `gh api /repos/gabrial1997/PocketPolyglot/pages`.

- [ ] **Step 4: Confirm URL contract** — the live URLs must equal `SUPPORT_URL`/`PRIVACY_URL` in `src/config/support.ts` exactly; fix the constants if they diverge (they are consumed by Settings rows and the runbook).

---

### Task 10: Content text audit (Track B — controller-orchestrated, parallel to Tasks 1–9)

**Files:**
- Modify (workspace root repo `/home/gabrial1997/workspace/pocketpolyglot`, a separate git repo): `words/latvian_top1000.csv`, `words/phrases.csv`
- Create: `words/ELIZABETE_REVIEW.md`, `words/audit/2026-07-09-audit-log.md` (what changed and why)
- Live DB: `lemmas.gloss_en/usage_note/literal_gloss`, `phrases.gloss_en/target/usage_note` updates (project `necfghfotwykjsykccsa`)

**Protocol (the controller runs this as a fan-out, not a single implementer):**

- [ ] **Step 1: Export** — dump `lemmas (id, lemma, gloss_en, pos, word_class, freq_rank, usage_note, literal_gloss)` and `phrases (id, target, gloss_en, literal_gloss, usage_note, is_idiom)` to scratch CSVs via the Supabase MCP.
- [ ] **Step 2: Fan out linguists** — batches of ~80 lemmas / ~50 phrases per subagent (≈13 + 6 agents). Each agent audits: (a) is `gloss_en` the correct primary meaning of the Latvian lemma/phrase? (b) Latvian spelling incl. diacritics correct? (c) for phrases: is `target` natural, idiomatic modern Latvian — something a native would actually say? (d) usage_note/literal_gloss accuracy where present. Each returns structured JSON per item: `{ id, verdict: 'ok' | 'fix' | 'native', fix?: { field, from, to, reason } }` (`native` = needs a native ear, not confidently fixable).
- [ ] **Step 3: Adversarial verify** — every `fix` goes to a second, independent linguist agent prompted to REFUTE it. Only fixes confirmed by the second agent are applied. Refuted or disputed → `native` bucket. **Never edit the Latvian headword (`lemma`) itself without this confirmation; gloss/note edits follow the same rule.**
- [ ] **Step 4: Apply** — confirmed fixes via SQL UPDATEs (one batched statement per table, logged in `words/audit/2026-07-09-audit-log.md` with id, field, from → to, reason). `qa_status` stays `draft` everywhere — native sign-off remains Elizabete's. Mirror every applied fix into `words/latvian_top1000.csv` / `words/phrases.csv` so the CSVs and DB agree; commit the root repo.
- [ ] **Step 5: Elizabete's list** — write `words/ELIZABETE_REVIEW.md`: (1) all `native`-bucket items with the open question per item; (2) the 239 audio-QA-flagged words (from `content-pipeline` needsReview output) as an ear-check list; (3) any audited item whose **text fix invalidates its existing audio** — flagged "re-record", since nothing is re-TTS'd this session; (4) the pronunciation-difficult recording list for her voice session. Compact: one line per item, grouped, checkbox format.
- [ ] **Step 6: Cross-check counts** — audit-log totals must reconcile: ok + fixed + native = items swept; state the numbers in the log. No silent truncation: if any batch agent fails, re-run it — never mark the sweep complete with a hole.

---

### Task 11: Final gate

- [ ] **Step 1:** Full CI quartet on `feat/release-readiness`: `npm run lint && npm run typecheck && npm test && npm run build` — all green (suite twice if StartingLoop flakes).
- [ ] **Step 2:** Verify migrations applied live: `select proname from pg_proc where proname in ('delete_account','get_distractors')` and `select count(*) from pg_views where viewname='user_coverage'` — all present; 0016/0017/0018 in `supabase_migrations.schema_migrations`.
- [ ] **Step 3:** Broad whole-branch code review (superpowers:requesting-code-review), fixes, re-review.
- [ ] **Step 4:** Merge to `main` via PR with CI green; hand the founder: PR link, the runbook, the on-device checklist, Elizabete's review file, and the two live page URLs. **The founder's on-device checklist run and the store submission are theirs — do not claim them done.**

---

## Task order & parallelism

- Tasks 1→2 sequential; 3→4 sequential; 5, 6, 7, 8, 9 independent of each other (6 before 9 only for the URL contract check; 8 after 7+9 exist so the runbook references real config/URLs).
- Task 10 runs in parallel with everything (different repo + DB).
- Task 11 last.
- Suggested execution order: 1, 2, 3, 4, 5, 6, 7, 9, 8, 11 — with 10 running alongside from the start.

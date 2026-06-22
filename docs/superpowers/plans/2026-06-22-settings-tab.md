# Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings bottom-tab destination (Menu · Profile · Appearance · Log out) ported from the Claude Design mockup `screens-settings.jsx`, wiring real theme control, profile display, sign-out, and a GDPR recording-consent surface.

**Architecture:** Tier-B standalone screen (NOT a pure card — no `ReviewItem`/`CardResult`). A pure presentational `SettingsScreen` (a small `view`-state router over Menu/Profile/Appearance sub-screens + a Log-out sheet) receives all data and callbacks as props. `SettingsHost` is the only stateful piece: it pulls `useAuth()` (name/email/sign-out), `useThemeMode()` (mode/setMode/dark), and a new injected `ProfileService` (recording consent + delete), then renders the screen. New SVG glyphs and reusable list primitives back the rows.

**Tech Stack:** Expo / React Native (TypeScript), `react-native-svg`, existing `ppTheme` token system, Supabase (`profiles`/`recordings` tables already exist since migration `0001`).

## Global Constraints

(From CLAUDE.md — every task implicitly includes these.)

- **NOT gamified.** No streaks/XP/confetti. Calm, premium, restrained.
- **No time claims** anywhere in copy ("10 min", "ten minutes a day").
- **Never the literal word "quiet"** in user-facing copy.
- **Theme tokens, not magic values.** Use `useTheme()` token fields; light + dark must both work. The carmine danger colour is the existing token `T.record` (`#C0485A`, identical both themes) — do NOT hardcode `#9E2B3A`.
- **TypeScript, no `any`** in any contract.
- **GDPR from day one.** No recording without `profiles.rec_consent`; honor deletion. The consent surface is **binding** and lives in a dedicated **Privacy** group under Profile (per the user's 2026-06-22 decision).
- **Pure-card boundary still holds for Tier-B:** `SettingsScreen` imports NO service, only `useTheme()` for tokens; all data/actions arrive as props from `SettingsHost`.
- **Fonts:** headline = `fonts.headline` (`'Spectral_500Medium'`), UI = `fonts.ui` (`'System'`) from `src/theme/tokens.ts`.

### Scope decisions locked 2026-06-22 (user)

- **Subscription: OMITTED.** Do not build `SubscriptionSettings`; drop the Subscription card from the Menu entirely. (Payments are post-MVP per CLAUDE.md.)
- **Profile editing: DISPLAY-ONLY.** Name/Email show real values but are not editable; Change photo / Change password render as inert visual rows. No `profiles` write for name in this pass.
- **GDPR consent: NEW "Privacy" group** under Profile (separate from Security), holding the consent toggle + "Delete my recordings".
- **Notifications toggle: local visual state only** (no persistence wired this pass; effect is a no-op since push infra doesn't exist). Flag as a follow-up.

---

## File Structure

- **Create** `src/components/SettingsPrimitives.tsx` — pure presentational list primitives (`SettCard`, `SettRow`, `SettSwitch`, `Avatar`, `SettGroupLabel`, `SettNavHeader`) + a `SETTINGS_ICONS` name→component map. Themed via `useTheme()`.
- **Modify** `src/components/icons.tsx` — add the new SVG glyphs the Settings rows/tab need.
- **Create** `src/screens/SettingsScreen.tsx` — pure router + `SettingsMenu`, `ProfileSettings`, `AppearanceSettings`, `LogoutSheet`. Data + callbacks in via props.
- **Create** `src/screens/SettingsHost.tsx` — Tier-B host wiring auth + theme + ProfileService.
- **Modify** `src/screens/index.ts` — export `SettingsHost`.
- **Modify** `src/services/index.ts` — add `ProfileService` interface + `profile` to `ServiceBundle`.
- **Modify** `src/services/stubs.ts` — `StubProfileService` + add to `createStubServices()`.
- **Create** `src/services/supabase/SupabaseProfileService.ts` — real impl (profiles read/write, recordings delete).
- **Modify** `src/services/supabase/index.ts` — export + wire into `createSupabaseServices()`.
- **Modify** `src/navigation/index.tsx` — register the `settings` route, TABS entry, render `SettingsHost`.
- **Tests:** `SettingsPrimitives.test.tsx`, `SettingsScreen.test.tsx`, `SettingsHost.test.tsx`, `SupabaseProfileService.test.ts` (logic project), and an icon smoke test folded into the primitives test.

**Test project routing (jest two-project setup):** `*.test.tsx` → `components` project (jest-expo, no type-check); `*.test.ts` → `logic` project (ts-jest, type-checks). So `SupabaseProfileService.test.ts` must be `.ts`. Type errors in `.tsx` surface only via `npm run typecheck`.

---

## Task 1: New SVG glyphs for Settings

**Files:**
- Modify: `src/components/icons.tsx` (append after `BarsIcon`, line 105)

**Interfaces:**
- Consumes: existing `IconProps` (`{ size?: number; color: string; strokeWidth?: number }`), `Svg, { Path, Circle, Line, Polygon }` already imported.
- Produces: standalone components `SettingsIcon`, `ChevronLeftIcon`, `BellIcon`, `SparkleIcon`, `HelpIcon`, `InfoIcon`, `LogoutIcon`, `PersonIcon`, `MailIcon`, `GlobeIcon`, `ShieldIcon`, `CameraIcon`, `AutoThemeIcon`, `CheckIcon`, `TrashIcon`. (Reuse existing `SunIcon`, `MoonIcon`, `ChevronRightIcon`.)

- [ ] **Step 1: Write the failing test** — create `src/components/SettingsIcons.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  SettingsIcon, ChevronLeftIcon, BellIcon, SparkleIcon, HelpIcon, InfoIcon,
  LogoutIcon, PersonIcon, MailIcon, GlobeIcon, ShieldIcon, CameraIcon,
  AutoThemeIcon, CheckIcon, TrashIcon,
} from './icons';

const ALL = [
  SettingsIcon, ChevronLeftIcon, BellIcon, SparkleIcon, HelpIcon, InfoIcon,
  LogoutIcon, PersonIcon, MailIcon, GlobeIcon, ShieldIcon, CameraIcon,
  AutoThemeIcon, CheckIcon, TrashIcon,
];

it('every new settings glyph renders with a color prop', () => {
  for (const Icon of ALL) {
    const { UNSAFE_root } = render(<Icon size={18} color="#123456" />);
    expect(UNSAFE_root).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run it to confirm it fails** — `npx jest SettingsIcons -i` → FAIL (imports not defined).

- [ ] **Step 3: Implement the glyphs** in `src/components/icons.tsx`. Each follows the existing stroke-based pattern (`viewBox="0 0 24 24"`, `fill="none"`, `stroke={color}`, default `strokeWidth = 1.8`, round caps/joins). Add:

```tsx
export function SettingsIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M12 3.5l1.4 2.2 2.6-.5.9 2.5 2.4 1.1-.5 2.6 1.7 2-1.7 2 .5 2.6-2.4 1.1-.9 2.5-2.6-.5L12 20.5l-1.4-2.2-2.6.5-.9-2.5-2.4-1.1.5-2.6L3 12l1.7-2-.5-2.6 2.4-1.1.9-2.5 2.6.5z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 18, color, strokeWidth = 2 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BellIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function SparkleIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

export function HelpIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M9.3 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.5 2-2.5 3.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={0.6} fill={color} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function InfoIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={12} y1={11} x2={12} y2={16.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={7.8} r={0.6} fill={color} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function LogoutIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 15l3-3-3-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={10} y1={12} x2={20} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function MailIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4.5 7.5l7.5 5 7.5-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function GlobeIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ShieldIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l7 2.5v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-6z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

export function CameraIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9a1 1 0 0 1 1-1h2l1.2-2h5.6L15 8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function AutoThemeIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  // Half-filled circle = "system / auto".
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 4a8 8 0 0 0 0 16z" fill={color} />
    </Svg>
  );
}

export function CheckIcon({ size = 19, color, strokeWidth = 2.4 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
```

- [ ] **Step 4: Run the test** — `npx jest SettingsIcons -i` → PASS (15/15 components render).

- [ ] **Step 5: Commit**

```bash
git add src/components/icons.tsx src/components/SettingsIcons.test.tsx
git commit -m "feat(settings): add SVG glyphs for the Settings tab"
```

---

## Task 2: ProfileService (consent + recording deletion)

**Files:**
- Modify: `src/services/index.ts` (add interface + bundle field)
- Modify: `src/services/stubs.ts` (StubProfileService + createStubServices)
- Create: `src/services/supabase/SupabaseProfileService.ts`
- Modify: `src/services/supabase/index.ts` (export + wire)
- Test: `src/services/supabase/SupabaseProfileService.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` (from `@supabase/supabase-js`), the existing `profiles` table (`id`, `rec_consent`, `rec_consent_at`) and `recordings` table (`user_id`), both from migration `0001`.
- Produces:
  ```ts
  export interface ProfileService {
    /** Current GDPR recording-consent flag for the signed-in user. */
    getRecConsent(): Promise<boolean>;
    /** Set the consent flag; stamps rec_consent_at when enabling. */
    setRecConsent(value: boolean): Promise<void>;
    /** Honor GDPR deletion: remove all of the user's recording rows. */
    deleteRecordings(): Promise<void>;
  }
  ```
  Added to `ServiceBundle` as `profile: ProfileService`.

- [ ] **Step 1: Write the failing test** — `src/services/supabase/SupabaseProfileService.test.ts`:

```ts
import { SupabaseProfileService } from './SupabaseProfileService';

// Minimal chainable fake of the Supabase query builder, recording the calls we assert on.
function fakeClient() {
  const calls: { table: string; op: string; payload?: unknown; eq?: [string, unknown] }[] = [];
  let nextSelectRow: Record<string, unknown> | null = { rec_consent: true };
  const client = {
    from(table: string) {
      const ctx: { table: string; op: string; payload?: unknown; eq?: [string, unknown] } = { table, op: '' };
      const builder: Record<string, unknown> = {
        select() { ctx.op = 'select'; return builder; },
        update(payload: unknown) { ctx.op = 'update'; ctx.payload = payload; return builder; },
        delete() { ctx.op = 'delete'; return builder; },
        eq(col: string, val: unknown) { ctx.eq = [col, val]; calls.push(ctx); return builder; },
        async maybeSingle() { return { data: nextSelectRow, error: null }; },
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
```

- [ ] **Step 2: Run it to confirm it fails** — `npx jest SupabaseProfileService -i` → FAIL (module not found).

- [ ] **Step 3: Add the interface + bundle field** in `src/services/index.ts` (after `PodcastService`, before `ServiceBundle`):

```ts
/** Tier-B `settings` screen: GDPR recording consent + deletion (CLAUDE.md). NOT a card. */
export interface ProfileService {
  getRecConsent(): Promise<boolean>;
  setRecConsent(value: boolean): Promise<void>;
  deleteRecordings(): Promise<void>;
}
```

and add to `ServiceBundle`:

```ts
  /** Tier-B settings screen: GDPR consent + recording deletion. */
  profile: ProfileService;
```

- [ ] **Step 4: Implement `SupabaseProfileService.ts`** (mirrors `SupabaseProgressService` style):

```ts
// Supabase-backed ProfileService — GDPR recording consent (profiles.rec_consent) + deletion.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileService } from '../index';

export class SupabaseProfileService implements ProfileService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getRecConsent(): Promise<boolean> {
    const { data, error } = await this.client
      .from('profiles')
      .select('rec_consent')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) throw error;
    const row = data as { rec_consent: boolean } | null;
    return row?.rec_consent ?? false;
  }

  async setRecConsent(value: boolean): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ rec_consent: value, rec_consent_at: value ? new Date().toISOString() : null })
      .eq('id', this.userId);
    if (error) throw error;
  }

  async deleteRecordings(): Promise<void> {
    const { error } = await this.client.from('recordings').delete().eq('user_id', this.userId);
    if (error) throw error;
  }
}
```

- [ ] **Step 5: Add `StubProfileService`** to `src/services/stubs.ts` (after `StubPodcastService`), import `ProfileService` in the type import block, and add to `createStubServices()`:

```ts
export class StubProfileService implements ProfileService {
  private consent = false;
  async getRecConsent(): Promise<boolean> {
    return this.consent;
  }
  async setRecConsent(value: boolean): Promise<void> {
    this.consent = value;
  }
  async deleteRecordings(): Promise<void> {
    // real impl: delete recordings rows + storage objects for the user
  }
}
```

In `createStubServices()` add `profile: new StubProfileService(),`.

- [ ] **Step 6: Wire the real service** in `src/services/supabase/index.ts` — add the import, the re-export, and the bundle field:

```ts
import { SupabaseProfileService } from './SupabaseProfileService';
// ...
export { SupabaseProfileService } from './SupabaseProfileService';
// ...in createSupabaseServices return:
    profile: new SupabaseProfileService(client, userId),
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx jest SupabaseProfileService -i` → PASS (5/5).
Run: `npm run typecheck` → clean (catches any `ServiceBundle` consumers missing `profile`; the stub default covers `ServiceProvider`).

- [ ] **Step 8: Commit**

```bash
git add src/services/index.ts src/services/stubs.ts src/services/supabase/
git commit -m "feat(settings): ProfileService for GDPR recording consent + deletion"
```

---

## Task 3: Settings list primitives

**Files:**
- Create: `src/components/SettingsPrimitives.tsx`
- Test: `src/components/SettingsPrimitives.test.tsx`

**Interfaces:**
- Consumes: `useTheme()` (Theme tokens), the Task 1 glyphs, `fonts` from `tokens.ts`.
- Produces (all pure, themed):
  - `SETTINGS_ICONS: Record<string, React.ComponentType<IconProps>>` — name→glyph (keys: `sun, moon, auto, bell, sparkle, help, info, logout, person, mail, globe, shield, camera, card, text, replay, check, chevR, chevL, trash`; map the unused-but-referenced `card/text/replay` to the closest existing glyph or omit if no Menu row uses them — only include keys actually rendered).
  - `SettGroupLabel({ children })`
  - `SettCard({ children, style? })`
  - `SettRow({ icon?, title, sub?, value?, chevron?, danger?, onPress?, isLast?, right? })`
  - `SettSwitch({ on, onToggle })`
  - `Avatar({ size?, initials })`
  - `SettNavHeader({ title, onBack, action? })`

- [ ] **Step 1: Write the failing test** — `src/components/SettingsPrimitives.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SettRow, SettSwitch, Avatar, SettNavHeader } from './SettingsPrimitives';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

it('SettRow fires onPress when tapped', () => {
  const onPress = jest.fn();
  const u = wrap(<SettRow title="Appearance" value="System" onPress={onPress} />);
  fireEvent.press(u.getByText('Appearance'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('SettSwitch toggles', () => {
  const onToggle = jest.fn();
  const u = wrap(<SettSwitch on={false} onToggle={onToggle} />);
  fireEvent.press(u.getByRole('switch'));
  expect(onToggle).toHaveBeenCalledTimes(1);
});

it('Avatar renders initials', () => {
  const u = wrap(<Avatar initials="G" />);
  expect(u.getByText('G')).toBeTruthy();
});

it('SettNavHeader fires onBack', () => {
  const onBack = jest.fn();
  const u = wrap(<SettNavHeader title="Profile" onBack={onBack} />);
  fireEvent.press(u.getByLabelText('Back'));
  expect(onBack).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to confirm it fails** — `npx jest SettingsPrimitives -i` → FAIL.

- [ ] **Step 3: Implement `SettingsPrimitives.tsx`.** Port the mock's primitives to RN. Key mappings from the web mock:
  - `div`→`View`, `button`→`Pressable`, text→`<Text>`; `boxShadow: T.shadow`→spread `T.shadow` (RnShadow) onto the card style; `T.dark ? … : …` reads `useTheme().dark`.
  - Icon tile: 32×32, `borderRadius: 10`, `backgroundColor: danger ? hexA(T.record, 0.12) : T.primarySoft`; glyph color `danger ? T.record : T.primary`.
  - Row: `minHeight: 58`, `padding: '12px 16px'`→`paddingVertical: 12, paddingHorizontal: 16`, `gap: 14`→`columnGap: 14`. Title `fontSize: 16, fontWeight: '500'`, color `danger ? T.record : T.ink`. Sub `fontSize: 12.5, color: T.faint`. Value `fontSize: 14.5, color: T.sub`. Trailing chevron via `SETTINGS_ICONS.chevR` (`ChevronRightIcon`) `color: T.faint`. Hairline divider: a 0.5/`StyleSheet.hairlineWidth` `View` at the row bottom inset `left: icon ? 62 : 16` unless `isLast`.
  - `SettSwitch`: a 46×28 pill `Pressable` with `accessibilityRole="switch"`, `accessibilityState={{ checked: on }}`, `accessibilityLabel="toggle"`; track `backgroundColor: on ? T.primary : (T.dark ? 'rgba(255,255,255,0.16)' : 'rgba(26,39,51,0.16)')`; 22×22 white knob, `left: on ? 21 : 3`.
  - `Avatar`: circle, `T.primarySoft` bg, `1px` border `hexA(T.primary, 0.2)`, serif initials `fonts.headline`, `color: T.primary`, `fontSize: size * 0.42`.
  - `SettNavHeader`: `paddingTop: 62`; round 36×36 back `Pressable` (`accessibilityRole="button"`, `accessibilityLabel="Back"`) with `ChevronLeftIcon` `color: T.sub`; optional `action` on the right; title `fontSize: 32, fontFamily: fonts.headline, color: T.ink`.
  - `SettGroupLabel`: uppercase `fontSize: 12, fontWeight: '600', letterSpacing: 1.2, color: T.faint`, `marginTop: 26, paddingBottom: 10`.
  - `SettCard`: `View`, `backgroundColor: T.surface, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: T.hair`, spread `T.shadow`, `overflow: 'hidden'`.

  Build `SETTINGS_ICONS` from the Task-1 glyphs + `SunIcon`/`MoonIcon`/`ChevronRightIcon`. Only include keys the screens render (Task 4): `sun, moon, auto, bell, sparkle, help, info, logout, person, mail, globe, shield, camera, check, chevR, chevL, trash`. `SettRow`'s `icon` prop is a key into this map.

- [ ] **Step 4: Run the test** — `npx jest SettingsPrimitives -i` → PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPrimitives.tsx src/components/SettingsPrimitives.test.tsx
git commit -m "feat(settings): themed list primitives (card/row/switch/avatar/header)"
```

---

## Task 4: SettingsScreen (pure router + sub-screens)

**Files:**
- Create: `src/screens/SettingsScreen.tsx`
- Test: `src/screens/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: Task 3 primitives, `useTheme`, `Screen` from `../components`.
- Produces:
  ```ts
  export interface SettingsScreenProps {
    name?: string;            // display name (first name) or undefined
    email?: string;           // auth email
    appVersion: string;       // e.g. "0.1.2"
    themeMode: 'light' | 'dark' | 'system';
    onSelectMode: (m: 'light' | 'dark' | 'system') => void;
    recConsent: boolean;
    onToggleConsent: (next: boolean) => void;
    onDeleteRecordings: () => void;
    onSignOut: () => void;
  }
  export function SettingsScreen(props: SettingsScreenProps): React.JSX.Element;
  ```
  A `view` state (`'menu' | 'profile' | 'appearance'`) routes the sub-screens; a `logout` boolean shows `LogoutSheet`. Initials for `Avatar` derive from `name` (first letter, uppercased) else `'?'`.

**Structure to port (from the mockup, with the locked scope changes):**
- **SettingsMenu** — header "Settings"; profile card (Avatar + name + email) → `setView('profile')`; **Preferences** card: Appearance row (`value={titleCase(themeMode)}` → `setView('appearance')`) + Notifications row (`SettSwitch`, **local state only**, no persistence); **Support** card: Help & feedback (inert), About (`value={"v"+appVersion}`, inert); **Log out** danger row → `setLogout(true)`; version footer `"PocketPolyglot · v{appVersion}"`. **NO Subscription card.** No `TabBar` here (the app shell renders the tab bar around the Host).
- **ProfileSettings** — `SettNavHeader title="Profile" onBack` (no Save action — display-only). Avatar (88) + "Change photo" inert button. **Account** card: Name (`value={name}`, no chevron, not pressable) + Email (`value={email}`, no chevron). **Languages** card: I speak = "English", Learning = "Latvian" (static). **Privacy** card (NEW — GDPR): "Recording consent" row with `right={<SettSwitch on={recConsent} onToggle={() => onToggleConsent(!recConsent)} />}`, `chevron={false}`, plus a sub line "Lets you record and compare your pronunciation."; "Delete my recordings" **danger** row (`icon="trash"`, `chevron={false}`) → `onDeleteRecordings()`. **Security** card: Change password (inert visual row).
- **AppearanceSettings** — `SettNavHeader title="Appearance" onBack`. Theme group with three check-rows Light/Dark/System (`icon: sun/moon/auto`), `on={themeMode === k}`, `onPress={() => onSelectMode(k)}`, trailing `CheckIcon` when selected. **This binds to the real theme store** (via props from the Host).
- **LogoutSheet** — a bottom sheet via RN `Modal` (`transparent animationType="slide"`): scrim `Pressable` (`accessibilityLabel="Dismiss"`) over `rgba(10,14,18,0.42)` calling `onCancel`; sheet `View` `backgroundColor: T.surface`, top radius 26, grab-handle, serif "Log out?" title, sub "Your progress is saved. You can sign back in anytime.", a danger "Log out" `Pressable` (`backgroundColor: T.record`, `LogoutIcon`) → `onSignOut`, and a "Cancel" outline `Pressable` → `onCancel`.

- [ ] **Step 1: Write the failing test** — `src/screens/SettingsScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen';

function setup(over: Partial<SettingsScreenProps> = {}) {
  const props: SettingsScreenProps = {
    name: 'Gabrial',
    email: 'gabrial@email.com',
    appVersion: '0.1.2',
    themeMode: 'system',
    onSelectMode: jest.fn(),
    recConsent: false,
    onToggleConsent: jest.fn(),
    onDeleteRecordings: jest.fn(),
    onSignOut: jest.fn(),
    ...over,
  };
  const u = render(<ThemeProvider><SettingsScreen {...props} /></ThemeProvider>);
  return { u, props };
}

it('shows the user name and email on the menu', () => {
  const { u } = setup();
  expect(u.getByText('Gabrial')).toBeTruthy();
  expect(u.getByText('gabrial@email.com')).toBeTruthy();
});

it('does NOT render a Subscription row (omitted by scope)', () => {
  const { u } = setup();
  expect(u.queryByText(/Subscription|Plus/)).toBeNull();
});

it('navigates to Appearance and selecting Dark calls onSelectMode', () => {
  const { u, props } = setup();
  fireEvent.press(u.getByText('Appearance'));
  fireEvent.press(u.getByText('Dark'));
  expect(props.onSelectMode).toHaveBeenCalledWith('dark');
});

it('the Privacy consent toggle calls onToggleConsent(true)', () => {
  const { u, props } = setup({ recConsent: false });
  fireEvent.press(u.getByText('Settings').parent ? u.getByText('Gabrial') : u.getByText('Gabrial')); // go to profile
  fireEvent.press(u.getByText('Gabrial')); // profile card → profile view
  // Recording consent switch lives under Profile › Privacy
  const sw = u.getAllByRole('switch').at(-1)!;
  fireEvent.press(sw);
  expect(props.onToggleConsent).toHaveBeenCalledWith(true);
});

it('log out → sheet → Log out button calls onSignOut', () => {
  const { u, props } = setup();
  fireEvent.press(u.getByText('Log out'));
  fireEvent.press(u.getAllByText('Log out').at(-1)!); // sheet confirm
  expect(props.onSignOut).toHaveBeenCalledTimes(1);
});
```

> Note: if the consent-toggle navigation in the test proves brittle (the profile card and its Name row both surface "Gabrial"), assert via a stable `accessibilityLabel` on the profile card (`"Open profile"`) and the consent switch (`"Recording consent"`) instead of text. Add those labels in the implementation.

- [ ] **Step 2: Run it to confirm it fails** — `npx jest SettingsScreen -i` → FAIL.

- [ ] **Step 3: Implement `SettingsScreen.tsx`** per the structure above. Give the profile card `accessibilityLabel="Open profile"` and the consent `SettSwitch` an `accessibilityLabel="Recording consent"` so tests/AT can target them. Notifications is `const [notif, setNotif] = useState(true)` — local only.

- [ ] **Step 4: Run the test** — `npx jest SettingsScreen -i` → PASS.

- [ ] **Step 5: Run typecheck/lint** — `npm run typecheck && npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.tsx src/screens/SettingsScreen.test.tsx
git commit -m "feat(settings): SettingsScreen (menu/profile/appearance + logout sheet)"
```

---

## Task 5: SettingsHost (Tier-B wiring)

**Files:**
- Create: `src/screens/SettingsHost.tsx`
- Modify: `src/screens/index.ts` (export)
- Test: `src/screens/SettingsHost.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`user`, `signOut`), `useThemeMode()` (`mode`, `setMode`), `useServices().profile`, and the `displayName` helper (duplicated locally OR exported from navigation — keep a small local copy to avoid a nav↔screens import cycle).
- Produces: `export function SettingsHost(): React.JSX.Element` rendering `SettingsScreen` with all props wired. Reads consent on mount (`profile.getRecConsent()`); `onToggleConsent` optimistically sets local state then calls `profile.setRecConsent(next)`; `onDeleteRecordings` calls `profile.deleteRecordings()`. `appVersion` from `expo-constants` (`Constants.expoConfig?.version ?? '0.1.2'`).

- [ ] **Step 1: Write the failing test** — `src/screens/SettingsHost.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import { SettingsHost } from './SettingsHost';

const signOut = jest.fn(async () => {});
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'gabrial@email.com', user_metadata: { name: 'Gabrial' } }, signOut }),
}));

function renderHost(services = createStubServices()) {
  return render(
    <ThemeProvider>
      <ServiceProvider services={services}>
        <SettingsHost />
      </ServiceProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => signOut.mockClear());

it('renders the auth email', async () => {
  const u = renderHost();
  expect(await u.findByText('gabrial@email.com')).toBeTruthy();
});

it('toggling Recording consent calls profile.setRecConsent', async () => {
  const services = createStubServices();
  const spy = jest.spyOn(services.profile, 'setRecConsent');
  const u = renderHost(services);
  fireEvent.press(u.getByLabelText('Open profile'));
  fireEvent.press(u.getByLabelText('Recording consent'));
  await waitFor(() => expect(spy).toHaveBeenCalledWith(true));
});

it('confirming log out calls auth.signOut', async () => {
  const u = renderHost();
  fireEvent.press(u.getByText('Log out'));
  fireEvent.press(u.getAllByText('Log out').at(-1)!);
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run it to confirm it fails** — `npx jest SettingsHost -i` → FAIL.

- [ ] **Step 3: Implement `SettingsHost.tsx`:**

```tsx
// SettingsHost — Tier-B host for the Settings tab (WIRING_MAP §3). Pulls auth (name/email/sign-out),
// theme mode, and the ProfileService (GDPR consent), then renders the pure SettingsScreen.
import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '../auth/AuthProvider';
import { useThemeMode } from '../theme/ThemeProvider';
import { useServices } from '../services/ServiceProvider';
import { SettingsScreen } from './SettingsScreen';

/** First-name from the user (mirrors navigation/index.tsx displayName; local copy avoids a cycle). */
function firstName(user: User | null): string | undefined {
  if (!user) return undefined;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const m = meta.name ?? meta.full_name ?? meta.display_name;
  if (typeof m === 'string' && m.trim()) return m.trim().split(' ')[0];
  const local = (user.email ?? '').split('@')[0]?.split('+')[0]?.replace(/[._-]+/g, ' ').trim() ?? '';
  if (!local) return undefined;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function SettingsHost(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { mode, setMode } = useThemeMode();
  const { profile } = useServices();
  const [recConsent, setRecConsent] = useState(false);

  useEffect(() => {
    let active = true;
    void profile.getRecConsent().then((v) => { if (active) setRecConsent(v); }).catch(() => {});
    return () => { active = false; };
  }, [profile]);

  const appVersion = Constants.expoConfig?.version ?? '0.1.2';

  return (
    <SettingsScreen
      name={firstName(user)}
      email={user?.email ?? undefined}
      appVersion={appVersion}
      themeMode={mode}
      onSelectMode={setMode}
      recConsent={recConsent}
      onToggleConsent={(next) => {
        setRecConsent(next); // optimistic
        void profile.setRecConsent(next).catch(() => setRecConsent(!next));
      }}
      onDeleteRecordings={() => { void profile.deleteRecordings().catch(() => {}); }}
      onSignOut={() => { void signOut(); }}
    />
  );
}
```

- [ ] **Step 4: Export** in `src/screens/index.ts`: `export { SettingsHost } from './SettingsHost';`

- [ ] **Step 5: Run the test** — `npx jest SettingsHost -i` → PASS. Then `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsHost.tsx src/screens/index.ts src/screens/SettingsHost.test.tsx
git commit -m "feat(settings): SettingsHost wires auth + theme + ProfileService"
```

---

## Task 6: Register the Settings tab

**Files:**
- Modify: `src/navigation/index.tsx`
- Test: `src/navigation/SettingsTab.test.tsx` (or extend an existing nav test if present)

**Interfaces:**
- Consumes: `SettingsHost` (from `../screens`), `SettingsIcon` (from `../components/icons`).
- Produces: a fourth tab `settings` rendering `SettingsHost` in `Root`.

- [ ] **Step 1: Write the failing test** — `src/navigation/SettingsTab.test.tsx`. Render `Root` is awkward (needs AuthGate/Supabase); instead assert the wiring at the TABS level by rendering the app's `TabBar`-bearing `Root` is out of scope. Simpler: a focused test that the `settings` route renders `SettingsHost`. Since `Root` builds its own providers, write a minimal smoke test that imports `TABS`-driven labels. If `Root`/`TabBar` aren't exported, export `TABS` for the test, or assert via a new small test that taps the "Settings" tab label. Pragmatic approach — extend the test to render `Root` within the existing provider mocks used by `SessionHost.test.tsx` (mock `../services/supabaseClient`). Minimum assertion:

```tsx
// Verify a Settings tab exists and routes to the settings host.
import { TABS } from './index'; // export TABS for testability
it('includes a Settings tab', () => {
  expect(TABS.map((t) => t.label)).toContain('Settings');
});
```

- [ ] **Step 2: Run it to confirm it fails** — `npx jest SettingsTab -i` → FAIL (`TABS` not exported / no Settings entry).

- [ ] **Step 3: Implement the wiring** in `src/navigation/index.tsx`:
  - Line 22: add `SettingsIcon` to the icons import.
  - Line 23: add `SettingsHost` to the screens import.
  - Line 35: `type Route = 'home' | 'pod' | 'prog' | 'settings' | 'session';`
  - Lines 38–42: `export const TABS` (add `export`) and append `{ route: 'settings', label: 'Settings', Icon: SettingsIcon }`.
  - In `Root` (after line 223): `{route === 'settings' ? <SettingsHost /> : null}`

- [ ] **Step 4: Run the test** — `npx jest SettingsTab -i` → PASS.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm run lint && npx jest -i`
Expected: typecheck + lint clean; all suites green (existing 285 + the new Settings tests).

- [ ] **Step 6: Commit**

```bash
git add src/navigation/index.tsx src/navigation/SettingsTab.test.tsx
git commit -m "feat(settings): register the Settings bottom tab"
```

---

## Self-Review checklist (run after all tasks)

1. **Spec coverage:** Menu ✅, Profile (display-only) ✅, Appearance (real theme) ✅, Log out (real) ✅, About version ✅, GDPR Privacy group ✅, Subscription omitted ✅, Notifications visual-only ✅.
2. **Constraints:** no gamification/time-claims/"quiet"; danger via `T.record` token; light+dark both work (snapshot or manual); no `any`.
3. **Boundary:** `SettingsScreen` imports no service; all data/actions via props; `SettingsHost` is the only stateful piece.
4. **Type consistency:** `ProfileService` shape identical across `index.ts` / stub / Supabase impl; `SettingsScreenProps` identical across Host and Screen.
5. **Deferred/flagged:** Notifications persistence; profile editing (name/photo/password); "Delete my recordings" has no UI confirm dialog yet (wire a confirm in a follow-up or fold into LogoutSheet-style sheet) — note for the final review.

## Manual/device check (after merge)

- Flip Light/Dark/System in Appearance and confirm the night illustrations + app chrome change live (this is the original reason for the tab).
- Toggle Recording consent and confirm it persists across a sign-out/in (writes `profiles.rec_consent`).
- Log out returns to the sign-in screen.

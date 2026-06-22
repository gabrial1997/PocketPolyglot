# Settings Tab — Design Spec (2026-06-22)

**Status:** draft, now aligned to the real Claude Design mockup **`screens-settings.jsx`** (design
project "PocketPolyglot", `ceff4014-c9cf-4360-93b5-8fc0d0f3ea4f` — fetch via `DesignSync get_file`).
**Open scope questions** at the bottom need the user's call before building Subscription.

**Goal:** A Settings bottom-tab destination that houses theme control (so the user can flip modes and
see the night illustrations), profile, account, support, and sign-out — ported from the mockup.

## Structure (from `screens-settings.jsx`)

`SettingsScreen` is a **router** holding a `view` state; each sub-screen is its own component. Port the
same shape in RN (a stack/nested navigator). Screens:

1. **SettingsMenu** — header "Settings" (+ optional `FolkSeam`); a tappable **profile card**
   (avatar initials, name, email) → Profile; **Preferences** card (Appearance row w/ current value;
   Notifications row w/ `Switch`); **Subscription** card (plan + "Active") → Subscription; **Support**
   card (Help & feedback; About w/ version); **Log out** danger row → logout sheet; version footer;
   `TabBar active="settings"`.
2. **ProfileSettings** — avatar + Change photo; Account (Name, Email); Languages (I speak / Learning);
   Security (Change password); a header **Save** action.
3. **AppearanceSettings** — Theme check-rows **Light / Dark / System**. *This is the one that binds to
   the real theme store.*
4. **SubscriptionSettings** — plan hero (price/renews/features), yearly upsell, Billing (payment method,
   history), Restore purchases, Cancel. **Placeholder data in the mock.**
5. **LogoutSheet** — bottom-sheet confirm ("Your progress is saved…"), Log out / Cancel.

Reusable primitives in the mock to port: `SettCard`, `SettRow` (icon tile + title/sub + value +
chevron + danger + trailing `right`), `Switch`, `Avatar`, `SettGroupLabel`, `SettNavHeader`,
`SettScroll`.

## Placement & tier

- New **bottom-tab "Settings"** (gear) alongside Today / Listen / Progress (`WIRING_MAP §3`, Tier B).
- **Tier B standalone** — NOT a card; no `ReviewItem`/`CardResult`. Reads/writes via injected services
  (theme, auth, profile), like `HomeScreen`/`ProgressScreen`.

## Functional staging (what actually wires vs. visual-only)

**v1 — real function:**
- **Appearance / Theme** → `useThemeMode().setMode('light'|'dark'|'system')` (`src/theme/ThemeProvider.tsx`).
  Already persisted (`pp.themeMode`) + flows app-wide via `T.dark`. **Pure wiring, no new persistence.**
  The Menu's Appearance row shows the current mode as its `value`.
- **Profile display** — real name + email from the Supabase auth user (same source as Home greeting).
- **Log out** — confirmation sheet → auth sign-out → login screen.
- **About** — show the app version (real), static links.

**v1 — visual shell, persist the preference, wire the effect later:**
- **Notifications toggle** — push infra isn't built; render the `Switch`, persist the boolean, no-op effect.
- **Profile editing** (edit name → `profiles` update; change photo → avatar upload; change password →
  auth reset). Name/email *display* is v1; *editing* can be v1 if cheap, else visual shell.
- **Languages** (I speak / Learning) — static display (English → Latvian) for now.

**Deferred / post-MVP (confirm with user):**
- **Subscription / payments** — CLAUDE.md: **scope = Phase 0 + Phase 1 only; payments are post-MVP.**
  Build as a **visual shell** with mock data (no App Store IAP / Stripe), or omit the Subscription row
  until billing is its own project. Do **not** wire real purchases in this pass.

## Required addition the mockup omits

- **GDPR recording consent** — CLAUDE.md mandates no recording row without `profiles.rec_consent`
  (recordings bucket private; honor deletion). The mockup has no privacy surface. **Add** a consent
  toggle + "Delete my recordings" under **Profile › Security** (or a new Privacy group). This is binding.

## Port notes (tokens/components the mock assumes)

The mock uses tokens/components that may need adding/mapping in the app theme (`docs/DESIGN_HANDOFF.md`,
`src/theme/tokens.ts`): `T.surface`, `T.hair`, `T.shadow`/`T.shadowCard`, `T.primarySoft`, `T.primary`,
`T.onPrimary`, `T.good`/`T.goodSoft`, `T.faint`, `T.sub`, `T.ink`; `ppHeadFont`/`PP_UI` (Spectral +
SF Pro — serif already loads app-wide); the `Icon` set (sun, moon, auto, bell, sparkle, help, info,
logout, person, mail, globe, shield, camera, card, text, replay, check, chevL, chevR); `FolkSeam`,
`TabBar`, `Screen`. Audit which exist; add the missing ones as theme tokens, not magic values.

## Constraints (CLAUDE.md — binding)

NOT gamified, calm/premium; no time claims; never the literal word "quiet" in copy; theme tokens not
magic values (light + dark both work); TypeScript no `any`; GDPR consent gates recording.

## Testing

- Theme rows call `setMode` and flip the resolved `dark` flag (mock `useColorScheme`, as in
  `CardImage.test.tsx`).
- Log out calls the auth service and routes to login (mock auth).
- Consent toggle calls the profile update with the new value (mock service).
- Snapshot Menu / Appearance / Profile in light and dark.

## Open questions for the user

1. **Subscription**: build the visual shell now (mock data, no real billing), or omit until payments
   is its own project?
2. **Profile editing** in v1 (name/photo/password), or display-only first?
3. Confirm the **GDPR consent** surface lives under Profile › Security.

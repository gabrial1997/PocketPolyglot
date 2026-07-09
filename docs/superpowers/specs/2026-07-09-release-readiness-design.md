# Release Readiness — Design (2026-07-09)

Goal: take the app from "core loop works" to **submittable to the public App Store**, with the
founder running the actual `eas build`/`eas submit` steps from a prepared runbook. Approach A
("minimum App Store viable") locked with the founder: every genuine App Review blocker, the
podcast lock screen, and a full content text audit — nothing speculative.

**Out of scope (founder-owned, later):** phrase/word audio recording (Elizabete's native voice —
explicitly the LAST step, after this session), podcast episode content/generator, App Store
screenshots, running builds/submission (founder does these from the runbook).

Base: `main` @ `f2cd694` (honest-data sweep #3 + live Progress page #4 merged; 808 tests green).

---

## 1. Podcast lock screen

The Listen tab is a wired but content-empty player ("No episode yet"). It becomes a locked
feature until the learner reaches 25% coverage.

- **Gate signal:** `progress.getCoverage()` (existing `ProgressCoverage = { total, knownRanks }`).
  Locked while `knownRanks.length / total < PODCAST_UNLOCK_COVERAGE`.
  `PODCAST_UNLOCK_COVERAGE = 0.25` — one named constant, single source of truth.
  Boundary: exactly 250/1000 known ⇒ **unlocked** (`>=` unlocks).
- **Host:** `PodcastHost` state union gains `locked`: `loading | error | locked | ready`.
  Coverage is fetched first; below threshold ⇒ render `PodcastLockedScreen` and **skip the
  episode fetch entirely**. Coverage fetch failure ⇒ existing
  retryable `HostError` — **fail-closed**: no coverage answer never means unlocked.
- **Screen:** new pure Tier-B `PodcastLockedScreen` (props-only, no services), visual language
  borrowed from `PhraseLocked` (dimmed content + lock hint) so locking reads as one system.
  Content: lock glyph; headline "Podcasts unlock at 25%"; body copy, coverage-framed and calm
  (episodes are built from words you already know; once you can follow a quarter of everyday
  speech, listening starts to make sense); current coverage % with the same coverage-bar
  treatment Home uses; single understated "Keep learning" action → navigates to the Today tab.
  Brand rules apply: no gamification, no time claims, never the word "quiet".
- **Tab stays visible** in the tab bar (hiding it would make the unlock undiscoverable).
- **At ≥25%:** existing behavior — episode fetch, honest "No episode yet" empty state.
- **Home teaser:** unchanged (already hidden unless a real episode exists).
- **Tests:** unit/snapshot for the pure screen (copy, % rendering, action callback); host tests
  for all four states; boundary test (250 known = unlocked, 249 = locked); fail-closed test
  (coverage error ⇒ error state, not unlocked).

## 2. App Review compliance

### 2a. Account deletion (Apple hard requirement — app has account creation)
- Settings → Security gains a **"Delete account"** row; two-step confirm using the same
  arm/disarm pattern as the dev Reset-progress button (tap → armed with explicit warning copy →
  second tap within timeout confirms).
- New **migration 0018**: `delete_account()` RPC, SECURITY DEFINER, pinned `search_path`,
  deleting in order: recordings storage objects (reuse the storage-first pattern from
  `deleteRecordings`) → user-owned rows (recordings, review_state, review_log, known_lemmas,
  bug_reports, profiles — everything keyed by `auth.uid()`) → the auth user itself
  (`auth.users` row). Idempotent; only ever deletes the calling user.
- Client: on success, sign out and return to auth screen. On failure: retryable error UI —
  never a silent partial delete.
- Tests: service-level (RPC called, error surfaced), Settings host wiring, migration reviewed
  for privilege containment (only `auth.uid()`, never a parameterized target).

### 2b. Consent explainer in onboarding
- The existing `ConsentScreen` (already fully written, GDPR copy) is mounted into
  `OnboardingGate` as a **one-time step after DiacriticOrientationScreen**.
- User picks yes/no; the choice writes `profiles.rec_consent`; **neither choice blocks**
  onboarding. Remains changeable in Settings → Privacy exactly as today. Speak cards already
  handle consent-off honestly (no change there).
- Same error posture as the diacritics step: on failure to load/persist state, advance rather
  than strand the user (consent stays default-off/fail-closed).

### 2c. Settings cleanup (dead rows a reviewer/user will tap)
- **Change photo** — removed.
- **Notifications toggle** — removed (no push infra; a toggle that does nothing is worse than
  absence).
- **Help & feedback** — becomes a working `mailto:` row to the founder's support address (same
  address as the support page, see §4).
- **Change password** — wired to Supabase's password-reset email flow
  (`resetPasswordForEmail`): confirmation state "Check your email" + error state.
- **About** — links to the published privacy policy + support pages (§4) alongside the
  existing version line, so it stops being a dead row.
- **Bug-reporter FAB stays in production** — it is the release feedback channel.

## 3. Release plumbing (prep-only; founder runs builds)

- **`eas.json`**: `development` / `preview` / `production` profiles; production = App Store
  build, `autoIncrement` for `ios.buildNumber`.
- **`app.config.ts` additions:** `icon`; splash via `expo-splash-screen` plugin (light/dark
  safe); `ios.buildNumber: '1'`; `ios.infoPlist.NSMicrophoneUsageDescription` in plain
  App-Review-friendly language ("PocketPolyglot records your voice only when you practice
  pronunciation, so you can compare your attempt with a native speaker.");
  `ios.config.usesNonExemptEncryption: false`.
- **Assets:** app icon (1024) + splash generated in-session in the app's calm serif visual
  language, committed under `assets/`; deliberately one-file swaps if the founder supplies
  artwork later.
- **Version:** stays `0.1.2` during the work; the runbook's first submission step bumps to
  `1.0.0` (app.config.ts + package.json together).
- **`docs/RELEASE_RUNBOOK.md`:** exact ordered steps — Apple Developer enrollment → Expo/EAS
  account + `eas login` → `eas build -p ios --profile production` → TestFlight sanity pass →
  App Store Connect metadata (drafted description/keywords/privacy-nutrition answers pre-filled,
  mic/recordings disclosures included) → `eas submit` → submit for review. Steps requiring
  founder credentials are explicitly marked **YOU**; everything else is already done.

## 4. Privacy policy + support page (GitHub Pages)

- Static pages published via GitHub Pages on the `gabrial1997/PocketPolyglot` repo from a
  dedicated **`gh-pages` branch** (NOT the `docs/` folder — that would publish the app's
  internal documentation).
- **Privacy policy:** plain-English, GDPR-grounded — account data; voice recordings (explicit
  consent, private bucket, in-app deletion incl. full account deletion, never shared);
  Supabase as processor; retention; contact address.
- **Support page:** brief FAQ + contact email.
- URLs flow into: the runbook's App Store Connect fields and Settings → About (§2c).
- **Founder input required at execution:** the support/privacy **contact email address**
  (publicly displayed by the App Store).

## 5. Content text audit (words + phrases)

- Fan-out linguist subagents over **all 1,019 lemma glosses and 263 phrases** in the live DB:
  gloss correctness, Latvian spelling/diacritics, phrase naturalness. The 146 low-confidence
  imports and 239 audio-QA-flagged words get explicit cross-checking.
- **Three buckets:**
  1. **Clear error → fixed** in DB *and* `words/*.csv` kept in sync. Adversarial verify: a fix
     is applied only after a second, independent linguist confirms it — no single-agent
     rewrites of the corpus.
  2. **Needs native ear → `words/ELIZABETE_REVIEW.md`** — compact checklist for Elizabete,
     including items whose text fix invalidates existing audio (flagged for re-recording, NOT
     re-TTS'd this session) and the pronunciation-difficult recording list.
  3. **Fine → untouched.**
- **No audio generation in this session** (founder decision: Elizabete records native audio
  later; phrase audio gap ships as the existing graceful audio-less card variants).

## 6. DB migrations + verification

- Apply to live Supabase at execution start (founder approval carried by this spec):
  **0016** (no-synonym distractors), **0017** (coverage denominator) — both already merged in
  git — and new **0018** (account deletion RPC) once written and reviewed.
- Every code task: TDD per repo norms; CI (lint · typecheck · test · build) green on every
  change.
- Final gate: full local suite + lint + typecheck + build, then a **founder on-device checklist**
  (`npm run phone`): podcast lock screen (below/above threshold via dev skip-day/known-words
  seeding), consent onboarding step, account deletion round-trip on a test account, Settings
  rows (mailto, password reset, About links), no dead taps anywhere.

---

## Execution shape

Implementation runs as a written plan executed by subagents on cleared context
(superpowers subagent-driven development): fresh implementer per task, task review each, broad
final review. The plan lives at `docs/superpowers/plans/2026-07-09-release-readiness.md`.
Content-audit fan-out (§5) is data work against the live DB and the `words/` CSVs in the
workspace root repo — it can run in parallel with app-code tasks; everything else lands in
this repo on a feature branch off `main` @ `f2cd694`.

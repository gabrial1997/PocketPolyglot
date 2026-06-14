# PocketPolyglot — Codebase Memory (for coding agents)

> This file is for **coding agents working inside this repo**. It is *not* the
> orchestrator brief (that lives one level up, in the project root). Read this before
> writing any code. Keep it tight; update it when an architectural fact changes.

## One-liner

Audio-first, speaking-first iOS app that takes an English speaker to casual
conversational Latvian as fast as possible. SRS trainer over the ~1,000 most common
Latvian words + phrases + perception drills + pronunciation compare.

## Architecture (three pieces, kept apart)

1. **App** — Expo / React Native (TypeScript). iOS-first, Android later. This repo.
2. **Backend** — Supabase: Auth, Postgres, Storage, Edge Functions. Migrations live in
   `supabase/migrations/`. Schema seed: `docs/database-schema-seed.md`.
3. **Speech-ML service** — a **separate inference service** (GOP pronunciation scoring on a
   Latvian phoneme recognizer). **Not** in Supabase, **not** in this repo. The app uploads a
   recording to Storage; the ML service scores asynchronously and writes the result back.
   See `docs/database-schema-seed.md` §7.

LLM/ML keys are proxied server-side (Edge Functions). **Never put a key in the client.**

## The non-negotiable boundary (do not break this)

**Cards are pure: data-in / events-out.** Every card is a presentational component. It
receives a `ReviewItem` + callbacks as props and reports outcomes via a `CardResult`. It owns
**only** ephemeral UI state (current stage, picked option, is-playing, speed). A card:

- never fetches, never schedules, never knows what comes next;
- never imports a service (`AudioService`, `RecorderService`, `SrsService`, `KnownWordsStore`)
  directly — services are **injected** via context/props;
- renders from `item` fields, never from hard-coded content.

**`SessionController` is the only stateful piece.** It fetches the day's batch, runs
`renderFor(item)` to pick the card+variant, passes item + callbacks down, and on
`onComplete(result)` posts to the SRS backend and advances.

Contracts: `docs/BACKEND_INTEGRATION.md` (the `ReviewItem` / `CardResult` shapes and per-card
contracts) and `docs/WIRING_MAP.md` (the one-to-one map: `CardKind` ↔ component ↔ file ↔
trigger prop ↔ sample data to delete, plus RN port notes). The `CardKind` `id`+`k` strings are
the canonical keys for analytics and deep links — **keep them stable**.

## Key conventions

- **TypeScript everywhere.** No `any` in card/controller contracts.
- **Small composable modules.** One card per file; one concern per module.
- **TDD where practical.** Cards are snapshot-/unit-testable precisely because they're pure —
  test them with fixture `ReviewItem`s, no live services. The controller's `renderFor()` is
  pure logic — unit-test it directly.
- **Keep CI green on every change.** `lint`, `typecheck`, `test`, `build` all pass. See
  `KICKOFF_PROMPT.md` and `.github/workflows/ci.yml`.
- **Theme tokens come from the design system**, not magic values. Port `ppTheme` first;
  light + dark must work before any screen. Tokens: `docs/DESIGN_HANDOFF.md` (Design Tokens).
- **Two screen tiers, wired differently** (`docs/WIRING_MAP.md` §3): Tier A = SRS cards
  (`word/*`, `phrase/*`, `drill`, `pron`) driven by the controller; Tier B = standalone
  screens (`home`, `pod`, `prog`) with their own services — **not** `ReviewItem`/`CardResult`.

## Locked product constraints (these override convenience)

- **Audio-first, speaking-first.** Every decision serves casual conversational Latvian fastest.
- **NOT gamified.** No streaks, no confetti, no XP. Calm, premium, restrained. (One earned
  unlock moment for phrases — the soft chime — is the *only* celebratory beat.) Do not add
  gamification even if it seems like an easy engagement win.
- **GDPR from day one.** Voice recordings are personal data. No recording row without explicit
  consent (`profiles.rec_consent`); recordings bucket is private; honor deletion. See
  `docs/database-schema-seed.md` §6.
- **Scope = Phase 0 + Phase 1 only.** Phase 0: record + A/B self-compare + minimal-pair drills
  (no model). Phase 1: GOP scoring via the external ML service. Everything else is post-MVP.
- **Morphology cutoff = 4 cases.** Nominative / accusative / dative / **locative** are taught
  explicitly; **genitive is incidental/chunk-first**; instrumental adds no distinct form
  (= acc.sg / dat.pl); vocative is marginal. This is **data, not hard-coded logic**
  (`wordforms.teach_mode`) — the cutoff can change with an UPDATE, not a code change. See
  `docs/latvian-case-frequency-morphology.md` and `DECISIONS.md`.

## Where to look

- `DECISIONS.md` — the condensed, locked decision log. Read before proposing changes.
- `docs/INDEX.md` — index of all coding docs.
- `docs/WIRING_MAP.md` · `docs/BACKEND_INTEGRATION.md` — the card boundary & port map.
- `docs/database-schema-seed.md` — Supabase schema seed (suggestions to adapt, not a contract).
- `CONTRIBUTING.md` — conventions, the data-in/events-out boundary, commit/PR norms.
- `KICKOFF_PROMPT.md` — the build order. STEP 0 is "green the CI pipeline."

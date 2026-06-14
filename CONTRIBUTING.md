# Contributing — Conventions

These are binding on humans and coding agents alike. The goal is a codebase that stays modular,
revisable without cascading breakage, and always shippable. Read `CLAUDE.md` and `DECISIONS.md`
first.

## The one rule that everything else protects: the card boundary

**Cards are pure — data-in / events-out.** A card is a presentational component that:

- receives a `ReviewItem` + callback props (and theme/i18n) and nothing else;
- emits outcomes via a `CardResult` through `onComplete` (and intermediate callbacks like
  `onPlay`, `onAnswer`, `onRecordStop`);
- owns **only** ephemeral UI state — current stage, picked option, is-playing, speed;
- **never** fetches, schedules, or knows what comes next;
- **never** imports a service (`AudioService`, `RecorderService`, `SrsService`,
  `KnownWordsStore`) — services are **injected** via context/props;
- **never** renders hard-coded content (`māja`, `labrīt`, `PP_PHRASES`, …) — only `item` fields.

If a change tempts you to break this (e.g. "just fetch inside the card"), stop — that's the
mistake the whole architecture exists to prevent. Route it through `SessionController`, the only
stateful piece. Contracts: `docs/BACKEND_INTEGRATION.md` + `docs/WIRING_MAP.md`.

## Module conventions

- **Small, composable files.** One card per file; one concern per module. Prefer a new small
  file over growing a big one.
- **TypeScript, strict.** No `any` in the `ReviewItem` / `CardResult` / `renderFor` contracts.
- **Theme tokens, not magic values.** Colors/spacing/type come from the theme context
  (`ppTheme`), never inline literals. Light + dark must both work.
- **Stable identifiers.** The `CardKind` `id`+`k` strings are analytics events and deep-link
  routes — never rename them casually.
- **Services isolated.** Each external dependency (Expo audio, Supabase, the ML service) lives
  behind one service module so swapping it touches one file.

## TDD

- Cards are **snapshot-/unit-testable with fixture `ReviewItem`s** precisely because they're
  pure — no live services needed. Write the fixture, render, assert the emitted `CardResult`.
- `renderFor()` is pure logic — unit-test it directly against item shapes.
- Where practical, write the test first. At minimum, a card is not "done" until it has a test
  that exercises its main path from a fixture.

## CI — keep it green on every change

The pipeline (`.github/workflows/ci.yml`) runs `lint → typecheck → test → build`. It must pass
on every PR and on `main`. Run `/run-ci` (or the four `npm run` scripts) locally before you push.
A red pipeline blocks merge. See `KICKOFF_PROMPT.md` STEP 0 — a green pipeline is the baseline
the whole project builds on.

## Commits & PRs

- **Commits:** small and focused; imperative mood. Conventional-commit prefixes encouraged:
  `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`. One logical change per commit.
- **PRs:** one card / one concern per PR where possible. The PR description states what changed,
  why, and confirms CI is green. If a PR touches the card boundary or a locked decision, say so
  explicitly and link the relevant `DECISIONS.md` entry.
- **Don't re-litigate locked decisions** in a PR. If you think one is wrong, raise it with the
  founder separately; don't quietly change it in code.

## Scope discipline

v1 = Phase 0 + Phase 1 (see `DECISIONS.md`). If an idea is good but out of scope, note it and
move on — don't build it. No gamification, ever, even as an "easy win."

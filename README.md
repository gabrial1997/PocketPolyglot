# PocketPolyglot App

> **v0.1.1** — polish phase. See [Changelog](#changelog).

> **Proprietary — All Rights Reserved. NOT open source.** This repository and its contents are the
> confidential, proprietary property of PocketPolyglot. No license to use, copy, modify, or
> distribute is granted. See [`LICENSE`](./LICENSE).

Multi-modal (hear / choose / say — equal parts) iOS app (Expo / React Native + TypeScript) that
takes an English speaker to casual conversational Latvian as fast as possible. A spaced-repetition
(FSRS) trainer over the ~1,000 most common Latvian words, plus phrase cards, minimal-pair
perception drills, pronunciation comparison, and an AI podcast. Progress is framed as **coverage**
of everyday speech — never points or streaks.

The pedagogical unit is the **core loop**, with listening as one of several equal modalities
(not "audio-first"):

> **Audio in → Meaning in → Meaning out (choose / say) → Audio out**

## What's in this folder

The built app plus its coding-agent setup: the Expo/RN source (`src/`), the architecture memory,
conventions, CI pipeline, agent definitions, slash commands, design/backend contracts, and the
Supabase backend (`supabase/`).

| File / dir | What it is |
|---|---|
| `src/` | The app source — pure cards, `SessionController`, injected services, theme tokens, screens. |
| `CLAUDE.md` | Codebase memory for coding agents — architecture, the boundary, constraints. Read first. |
| `DECISIONS.md` | Condensed, locked decision log (stack, 4-case morphology, dynamic distractors, no-streaks, Supabase, GDPR). |
| `KICKOFF_PROMPT.md` | The prompt to paste into Claude Code to start building. **STEP 0 = green the CI pipeline.** |
| `CONTRIBUTING.md` | Conventions: small modules, TDD, the card boundary, commit/PR norms. |
| `.github/workflows/ci.yml` | CI: install → lint → typecheck → test → build, on PR + push to main. |
| `.claude/agents/` | Subagent definitions (frontend card porter, backend schema, QA reviewer). |
| `.claude/commands/` | Slash commands (`/port-card`, `/run-ci`, `/new-migration`). |
| `docs/` | The coding docs: wiring map, backend integration, design handoff, schema seed, morphology. See `docs/INDEX.md`. |
| `supabase/` | Migrations + Edge Functions (owned by the backend track). |

## Setup

1. **Copy this folder into your dev environment.** On the founder's machine that means copying
   it into WSL, e.g.:
   ```bash
   cp -r /mnt/c/Users/gabrial/Desktop/workspace/projects/pocketpolyglot/pocketpolyglot-app \
         ~/workspace/pocketpolyglot
   cd ~/workspace/pocketpolyglot
   ```
   (Build inside WSL/Linux, not directly on the Windows mount — npm + native tooling are far
   faster and less error-prone there.)

2. **Install dependencies.**
   ```bash
   npm ci   # or: npm install   (first time, if no lockfile yet)
   ```

3. **Green the pipeline (STEP 0).** Before any feature work, make these all pass:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
   A green pipeline is the definition of "ready to start." See `KICKOFF_PROMPT.md`.

4. **Configure env.** Copy `.env.example` to `.env` and fill in the Supabase URL + anon key.
   Never commit `.env`. LLM/ML keys are server-side (Edge Functions) only.

5. **Start building.** Open Claude Code in this repo and paste the prompt from
   `KICKOFF_PROMPT.md`.

## Architecture in one breath

Expo/RN app (this repo) + Supabase backend (auth/DB/storage/edge) + a **separate** speech-ML
inference service for pronunciation scoring. Cards are pure (data-in / events-out); services are
injected; `SessionController` is the only stateful piece. Full detail in `CLAUDE.md`.

## Changelog

### v0.1.1 — polish
Post-golden-slice cleanup pass (code audit → fixes → dead-code removal):

- **Bug fixes**
  - Auth no longer hangs on "Loading…" when the cold-start `getSession()` rejects.
  - A rejected `recorder.stop()` still submits the result and advances the session.
  - Loop cards (`word/say`, `word/pic-review`) guard against a double-tap firing
    `onRecordStart()` twice, and lock the reddened wrong choice until "Try again".
  - `schedule()` no longer resets FSRS memory for a mid-flight `stage:'new'` row that
    already carries stability.
  - `get_distractors` (migration `0006`) returns distractors even when the target lemma
    has a NULL `freq_band`, instead of an empty set.
- **Honest waveform**: the native-compare bars render from the seeded RMS envelope; the
  no-envelope fallback eases to rest instead of faking timer-driven motion.
- **Dead-code removal**: dropped the unused standalone registry, the `useAccent` hook,
  unconsumed theme tokens, decl-only Supabase upsert/insert types, and the generated
  `database.types.ts`.

### v0.1.0 — golden slice
First end-to-end vertical slice: one of every card + phrase lock→unlock + the L/Ļ and
`ie`-diphthong drills, seeded via the golden-slice manifest, polished light + dark.

# PocketPolyglot App

> **Proprietary — All Rights Reserved. NOT open source.** This repository and its contents are the
> confidential, proprietary property of PocketPolyglot. No license to use, copy, modify, or
> distribute is granted. See [`LICENSE`](./LICENSE).

Audio-first, speaking-first iOS app (Expo / React Native + TypeScript) that takes an English
speaker to casual conversational Latvian as fast as possible. A spaced-repetition (FSRS) trainer
over the ~1,000 most common Latvian words, plus phrase cards, minimal-pair perception drills,
pronunciation comparison, and an AI podcast — built around one pedagogical arc, the **core loop**:

> **Audio in → Meaning in → Meaning out → Audio out**

## What's in this folder

This is the **repo scaffold + coding-agent setup**, designed to be copied into your codebase and
built out by Claude Code. It contains the architecture memory, conventions, CI pipeline, agent
definitions, slash commands, and the design/backend contracts — plus the app scaffold
(`package.json`, `tsconfig`, Expo config, `supabase/`).

| File / dir | What it is |
|---|---|
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

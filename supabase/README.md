# PocketPolyglot — Supabase backend

**Status: DRAFT. Nothing here has been applied to any project (local or hosted).**
These are migration + config files only, awaiting a CTO + QA review pass before
they are locked and applied.

This folder is the Supabase backend that fulfills the frontend data contract in
`branding/.../design_handoff_pocketpolyglot/BACKEND_INTEGRATION.md`
(`ReviewItem` / `CardResult`). The schema is derived from
`docs/technical/database-schema-seed.md` (the source of truth).

## Layout

```
supabase/
  config.toml                    # local dev stack config (ports, storage, auth)
  migrations/
    0001_init.sql                # full schema: content + user-state tables,
                                 #   known_lemmas/user_coverage views,
                                 #   get_distractors() function
    0002_rls.sql                 # Row-Level Security + GDPR gating +
                                 #   private recordings Storage bucket
  functions/
    get_distractors.sql          # canonical reference copy of the distractor
                                 #   picker (also created in 0001). NOT an Edge
                                 #   Function — it's a Postgres SQL function.
  seed.sql                       # placeholder — seeding waits on the curated
                                 #   lemma list (linguistics pipeline)
```

## What's in the schema

Two clean tiers (per the design principle "content is a shared library; user
state is per-user"):

- **Content (shared, read-mostly):** `lemmas`, `wordforms`, `phrases`,
  `phrase_components`, `minimal_pairs`, `audio_assets`, `podcast_episodes`.
  RLS: `SELECT` for `authenticated`; all writes are `service_role`-only
  (the content pipeline).
- **User state (per-user, RLS-protected):** `profiles`, `review_state`,
  `review_log`, `recordings`. RLS: `auth.uid() = user_id`. Recording inserts
  are additionally gated on `profiles.rec_consent = true` (GDPR).
- **Views:** `known_lemmas` (phrase-unlock gate, derived from `review_state`),
  `user_coverage` (progress screen).
- **Function:** `get_distractors(target, n)` — runtime multiple-choice
  distractor selection (same `word_class` + nearby `freq_band`).

### Notable deltas from the seed doc (intentional)

- **No streak feature.** `profiles.streak_count` is omitted — locked
  no-gamification constraint.
- **Audio columns added.** `lemmas.native_url` and `lemmas.slow_url` exist so
  `ReviewItem.audio { nativeUrl, slowUrl }` maps directly. `audio_assets` is
  kept too for the HVPT multi-voice upgrade.
- **Morphology is a data switch.** `wordforms.teach_mode` defaults to
  `'incidental'`; nominative/accusative/dative/locative forms are set to
  `'explicit'` at seed time, genitive (and others) stay `'incidental'`.
  Changing the cutoff later is an `UPDATE`, not a code change.

## How to apply (once approved — not yet done)

These files target the Supabase CLI. From `pocketpolyglot-app/`:

1. **Install + start the local stack** (Docker required):
   ```bash
   supabase start
   ```
   This reads `config.toml` and applies everything in `migrations/` in order,
   then runs `seed.sql` (currently a no-op).

2. **Reset / re-apply migrations locally** (drops + recreates the local DB):
   ```bash
   supabase db reset
   ```

3. **Apply to a hosted project** (only after CTO/QA sign-off, and after
   linking with `supabase link --project-ref <ref>`):
   ```bash
   supabase db push
   ```
   `db push` applies any migrations in `migrations/` that the linked project
   has not yet run. **Do not run this until the schema is locked.**

4. **Generate TypeScript types** for the app once applied:
   ```bash
   supabase gen types typescript --local > ../src/types/database.ts
   ```

## What is NOT in Supabase

Pronunciation/GOP ML scoring runs on a **separate inference service**. Supabase
is the front door + store: the client uploads a recording blob to the private
`recordings` bucket, inserts a `recordings` row (with `consent_at`), and an Edge
Function / queue notifies the ML service with the storage path. The ML service
writes `score` / `score_payload` back via `service_role`. LLM/ML keys stay
server-side, never in the client.

## Open items for the CTO/QA pass

- Confirm `ts-fsrs` field names map cleanly onto `review_state`
  (`stability` / `difficulty` / `due_at`); decide client-side vs Edge-Function
  scheduling.
- Whether to FSRS-track individual `wordforms` (`item_type='wordform'` is
  already allowed by the CHECK) or keep case forms inside phrases only.
- `native_url`/`slow_url` vs `audio_assets`-from-day-one (HVPT voice count).
- Distractor count `n` per `CardKind`; whether `word/hear` vs `word/say` need
  different pools.
- Lock `wordforms.teach_mode` cutoff once LVTB numbers + Elizabete's
  case-error-tolerance test are in.

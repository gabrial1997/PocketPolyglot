---
description: Create a new Supabase migration from the schema seed, with RLS and GDPR baked in.
argument-hint: <short description> (e.g. "content tables + RLS", "recordings + consent gate")
---

Create a new Supabase Postgres migration for: **$ARGUMENTS**, using the `backend-schema`
approach.

Steps:

1. Read the relevant section of `docs/database-schema-seed.md`. Treat it as **suggestions to
   adapt, not a contract** — resolve any §9 open item explicitly rather than copying blindly.
2. Create a new timestamped migration file in `supabase/migrations/` (format
   `YYYYMMDDHHMMSS_<slug>.sql`). One concern per migration; keep it small and ordered.
3. Apply the locked rules:
   - **Two-tier split:** content tables (shared, read-mostly) vs. user-state tables (per-user).
   - **RLS in this migration if it creates a table** — content: `authenticated` read,
     `service_role` write; user tables: `auth.uid() = user_id` for all ops.
   - **Recordings:** no row without consent (`consent_at` set, `profiles.rec_consent = true`);
     private Storage bucket. Honor deletion.
   - **Distractors dynamic:** if relevant, the `get_distractors` function; keep
     `semantic_field` / `phonetic_key` nullable.
   - **Morphology cutoff is data:** `wordforms.teach_mode` ('explicit' | 'incidental').
   - **No ML in Supabase:** the external service writes `score` / `score_payload` back.
4. Regenerate the TypeScript types from the schema and confirm typecheck passes.
5. Run `/run-ci`; keep CI green.

Report: the migration filename, what it creates, and any seed §9 open item you resolved.

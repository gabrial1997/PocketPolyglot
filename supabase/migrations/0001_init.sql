-- =====================================================================
-- PocketPolyglot — 0001_init.sql  (DRAFT SCHEMA)
-- ---------------------------------------------------------------------
-- Derived from: docs/technical/database-schema-seed.md
-- Companion contract: branding/.../design_handoff_pocketpolyglot/
--   BACKEND_INTEGRATION.md  (ReviewItem / CardResult shapes)
--
-- STATUS: DRAFT — NOT YET APPLIED to any live or local project.
--         CTO + QA review pending before this is locked.
--
-- Two-tier model:
--   CONTENT (shared, read-mostly)  -> RLS: read by authenticated, write by service_role
--   USER STATE (per-user)          -> RLS: auth.uid() = user_id
-- RLS policies + Storage live in 0002_rls.sql (kept separate on purpose).
--
-- MANDATORY DELTAS vs the seed doc (locked constraints):
--   * NO streak feature: profiles.streak_count is intentionally OMITTED
--     (no-gamification constraint, memory.md).
--   * lemmas.native_url / lemmas.slow_url columns ADDED so the
--     ReviewItem.audio { nativeUrl, slowUrl } contract is satisfiable
--     directly from the lemma row. audio_assets is also kept for HVPT.
--   * wordforms.teach_mode is driven by a data switch: nom/acc/dat/loc =>
--     'explicit', genitive (+ everything else) => 'incidental'.
-- =====================================================================

-- gen_random_uuid() lives in pgcrypto. On Supabase it is usually present,
-- but declare it idempotently so a fresh `db reset` works standalone.
create extension if not exists "pgcrypto";

-- =====================================================================
-- SECTION A — CONTENT TABLES (shared library, read-mostly)
-- =====================================================================

-- ---------------------------------------------------------------------
-- lemmas — the vocabulary unit (the base/dictionary form)
-- Maps to ReviewItem: lemma->target, gloss_en->gloss, pron->pron,
-- word_class->wordClass, media->media, mnemonic->mnemonic,
-- examples->examples, (native_url, slow_url)->audio{nativeUrl,slowUrl}.
-- ---------------------------------------------------------------------
create table public.lemmas (
  id             uuid primary key default gen_random_uuid(),
  lemma          text not null,                  -- dictionary form, e.g. 'māja'  -> ReviewItem.target
  gloss_en       text not null,                  -- 'house'                       -> ReviewItem.gloss
  pron           text,                           -- 'MAH-ya'                      -> ReviewItem.pron
  pos            text,                           -- 'noun'|'verb'|'adj'|'adv'|'prep'|...
  word_class     text not null,                  -- 'concrete'|'abstract'|'function' (drives learn template)
  freq_rank      integer,                        -- lemma-frequency rank AFTER lemmatization
  freq_count     integer,
  freq_band      smallint,                       -- bucketed rank (e.g. 1..10) — distractor selection
  cefr           text,                           -- optional A1/A2/...

  -- DELTA: simple-now audio columns so ReviewItem.audio maps directly.
  -- HVPT multi-voice audio additionally lives in audio_assets (below).
  native_url     text,                           -- -> ReviewItem.audio.nativeUrl
  slow_url       text,                           -- -> ReviewItem.audio.slowUrl

  -- presentation payloads, selected by word_class:
  media          jsonb,                          -- { imageUrl, imageUrlDark }      (concrete) -> ReviewItem.media
  mnemonic       jsonb,                          -- { soundsLike, note }            (abstract) -> ReviewItem.mnemonic
  examples       jsonb,                          -- [{ pre, w, post, en, audioUrl }](function) -> ReviewItem.examples

  -- upgrade columns for smarter distractors (nullable now, fill later):
  semantic_field text,                           -- e.g. 'dwelling' — semantic distractors (upgrade)
  phonetic_key   text,                           -- coarse phonetic shape — confusable distractors (upgrade)

  qa_status      text not null default 'draft',  -- 'draft'|'native_ok'|'locked'  (Elizabete QA)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint lemmas_word_class_chk
    check (word_class in ('concrete','abstract','function')),
  constraint lemmas_qa_status_chk
    check (qa_status in ('draft','native_ok','locked'))
);
create index lemmas_freq_rank_idx on public.lemmas (freq_rank);
create index lemmas_word_class_freq_band_idx on public.lemmas (word_class, freq_band); -- distractor query path

-- ---------------------------------------------------------------------
-- wordforms — inflected case forms (the morphology decision lives here)
--
-- DATA SWITCH (memory.md principle 10, 2026-06-14):
--   nominative + accusative + dative + locative  => teach_mode 'explicit'
--   genitive (and anything else)                 => teach_mode 'incidental'
-- Modeled as DATA, not hard-coded logic, so changing the cutoff later is an
-- UPDATE, not a code change. Default below is 'incidental'; the explicit set
-- is set when forms are seeded. The CHECK enforces only the allowed cases —
-- no distinct 'ins'/'voc' (instrumental == acc sg / dat pl; vocative marginal).
-- ---------------------------------------------------------------------
create table public.wordforms (
  id           uuid primary key default gen_random_uuid(),
  lemma_id     uuid not null references public.lemmas(id) on delete cascade,
  form         text not null,                    -- inflected surface form, e.g. 'mājā' (locative)
  gram_case    text not null,                    -- 'nom'|'acc'|'dat'|'loc'|'gen'
  number       text not null default 'sg',       -- 'sg'|'pl'
  freq_count   integer,                          -- form-level frequency (from LVTB)
  teach_mode   text not null default 'incidental', -- 'explicit' (nom/acc/dat/loc) | 'incidental' (gen, ...)
  created_at   timestamptz not null default now(),

  unique (lemma_id, gram_case, number),
  constraint wordforms_gram_case_chk
    check (gram_case in ('nom','acc','dat','loc','gen')),
  constraint wordforms_number_chk
    check (number in ('sg','pl')),
  constraint wordforms_teach_mode_chk
    check (teach_mode in ('explicit','incidental'))
);
create index wordforms_lemma_id_idx on public.wordforms (lemma_id);

-- ---------------------------------------------------------------------
-- phrases — multi-word units (the conversational vehicle)
-- ---------------------------------------------------------------------
create table public.phrases (
  id          uuid primary key default gen_random_uuid(),
  target      text not null,                     -- 'Es dzeru kafiju'  -> ReviewItem.target
  gloss_en    text not null,                     -- 'I drink coffee'   -> ReviewItem.gloss
  audio_url   text,
  is_idiom    boolean not null default false,    -- true => run 'phrase/meaning' MC (literal != actual)
  seed        text,
  qa_status   text not null default 'draft',
  created_at  timestamptz not null default now(),

  constraint phrases_qa_status_chk
    check (qa_status in ('draft','native_ok','locked'))
);

-- ---------------------------------------------------------------------
-- phrase_components — unlock gating (the i+1 gate)
-- A phrase unlocks only when ALL its component lemmas (except the <=1 is_new)
-- are "known" for the user (see known_lemmas view + KnownWordsStore).
-- ---------------------------------------------------------------------
create table public.phrase_components (
  phrase_id  uuid not null references public.phrases(id) on delete cascade,
  lemma_id   uuid not null references public.lemmas(id) on delete restrict,
  is_new     boolean not null default false,     -- the one allowed-unknown word under i+1 (<=1)
  position   smallint,                            -- ordering for display/highlight
  primary key (phrase_id, lemma_id)
);
create index phrase_components_lemma_id_idx on public.phrase_components (lemma_id);

-- ---------------------------------------------------------------------
-- minimal_pairs — perception drills
-- ---------------------------------------------------------------------
create table public.minimal_pairs (
  id            uuid primary key default gen_random_uuid(),
  a             text not null,                    -- -> ReviewItem.pair.a
  b             text not null,                    -- -> ReviewItem.pair.b
  correct       char(1) not null check (correct in ('a','b')),
  audio_url     text not null,                    -- the stimulus actually played
  contrast_type text not null,                    -- 'L_vs_Ļ'|'vowel_length'|...
  qa_status     text not null default 'draft',
  created_at    timestamptz not null default now(),

  constraint minimal_pairs_qa_status_chk
    check (qa_status in ('draft','native_ok','locked'))
);

-- ---------------------------------------------------------------------
-- audio_assets — HVPT multi-voice (normalized audio out of content rows)
-- Kept alongside lemmas.native_url/slow_url. The two columns satisfy the
-- ReviewItem contract today; audio_assets is the HVPT upgrade surface
-- (many voices per hard contrast). owner_id is a soft reference (polymorphic
-- by owner_type) — no FK, validated in the content pipeline.
-- ---------------------------------------------------------------------
create table public.audio_assets (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null,                     -- 'lemma'|'wordform'|'phrase'|'pair'
  owner_id     uuid not null,
  voice_id     text not null,                     -- speaker (Elizabete, TTS voice X, ...)
  rate         text not null default 'native',    -- 'native'|'slow'
  storage_path text not null,                      -- Supabase Storage path
  created_at   timestamptz not null default now(),

  constraint audio_assets_owner_type_chk
    check (owner_type in ('lemma','wordform','phrase','pair')),
  constraint audio_assets_rate_chk
    check (rate in ('native','slow'))
);
create index audio_assets_owner_idx on public.audio_assets (owner_type, owner_id);

-- ---------------------------------------------------------------------
-- podcast_episodes — Tier-B listening (pre-generated shared, coverage-gated)
-- ---------------------------------------------------------------------
create table public.podcast_episodes (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  audio_url    text not null,
  transcript   text,
  level_band   smallint,                          -- min coverage band required to unlock
  lemma_ids    uuid[],                            -- words it was built from (all within level_band)
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- SECTION B — USER STATE TABLES (per-user, RLS-protected in 0002)
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — user + GDPR consent
-- DELTA: streak_count is intentionally OMITTED (no-gamification constraint).
-- ---------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  settings          jsonb not null default '{}'::jsonb,  -- theme/accent/speed prefs, reduced-motion
  -- GDPR: recording + training consent, captured explicitly.
  rec_consent       boolean not null default false,
  rec_consent_at    timestamptz,
  training_consent  boolean not null default false,      -- permission to train the model on recordings
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- review_state — FSRS schedule (one row per user per learnable item)
-- item_type 'lemma'|'phrase'|'pair'; room for 'wordform' later.
-- NB: controller maps DB 'lemma' <-> contract ReviewItem.type='word'.
-- ---------------------------------------------------------------------
create table public.review_state (
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_type    text not null,                     -- 'lemma'|'phrase'|'pair' (room for 'wordform')
  item_id      uuid not null,
  stage        text not null default 'new',       -- 'new'|'learning'|'review'|'mature' -> ReviewItem.stage
  reps         integer not null default 0,        -- -> ReviewItem.reps
  lapses       integer not null default 0,
  -- FSRS memory model (ts-fsrs): confirm field mapping in CTO/QA pass.
  stability    double precision,
  difficulty   double precision,
  due_at       timestamptz,
  last_review  timestamptz,
  primary key (user_id, item_type, item_id),

  constraint review_state_item_type_chk
    check (item_type in ('lemma','phrase','pair','wordform')),
  constraint review_state_stage_chk
    check (stage in ('new','learning','review','mature'))
);
create index review_state_user_due_idx on public.review_state (user_id, due_at); -- getDueBatch() path

-- ---------------------------------------------------------------------
-- review_log — append-only history (one row per CardResult)
-- ---------------------------------------------------------------------
create table public.review_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  item_type      text not null,
  item_id        uuid not null,
  card_kind      text not null,                   -- 'word/pic-review' etc. — stable wiring-map key
  correct        boolean,                         -- CardResult.correct (null for learn cards)
  spoke          boolean,                         -- CardResult.spoke
  self_rating    text,                            -- 'good'|'again' (phrase sayit) CardResult.selfRating
  latency_ms     integer,                         -- CardResult.latencyMs
  recording_id   uuid references public.recordings(id) on delete set null, -- set if the user recorded
  interval_label text,                            -- "next review in N days" handed back to the card
  created_at     timestamptz not null default now(),

  constraint review_log_self_rating_chk
    check (self_rating is null or self_rating in ('good','again'))
);
-- NB: forward reference to recordings — created below, FK added after.
create index review_log_user_created_idx on public.review_log (user_id, created_at);

-- ---------------------------------------------------------------------
-- recordings — voice blobs + ML scores (GDPR-sensitive)
-- consent_at MUST be set at insert (no consent => no row). RLS in 0002
-- additionally gates inserts on profiles.rec_consent = true.
-- Score columns are filled asynchronously by the external ML service.
-- ---------------------------------------------------------------------
create table public.recordings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  storage_path  text not null,                    -- private Supabase Storage bucket
  duration_ms   integer,
  consent_at    timestamptz not null,             -- MUST be set at insert
  -- filled asynchronously by the external ML service:
  score         double precision,
  score_payload jsonb,                            -- per-phoneme GOP, alignment, etc.
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- DEFERRED FK — review_log.recording_id -> recordings.id
-- review_log is declared before recordings (so its other columns read in
-- contract order); attach the FK now that recordings exists.
-- =====================================================================
alter table public.review_log
  add constraint review_log_recording_id_fkey
  foreign key (recording_id) references public.recordings(id) on delete set null;

-- =====================================================================
-- SECTION C — VIEWS
-- =====================================================================

-- ---------------------------------------------------------------------
-- known_lemmas — phrase-unlock gate. Derived from review_state so it
-- cannot drift. A lemma is "known" once it reaches review/mature.
-- security_invoker => the querying user's RLS on review_state applies,
-- so a user only ever sees their own known lemmas.
-- ---------------------------------------------------------------------
create view public.known_lemmas
  with (security_invoker = true) as
  select user_id, item_id as lemma_id
  from public.review_state
  where item_type = 'lemma'
    and stage in ('review','mature');   -- tune the threshold in QA pass

-- ---------------------------------------------------------------------
-- user_coverage — progress screen: known distinct lemmas / total surfaced
-- lemmas (qa_status <> 'draft'). View over known_lemmas + lemmas. No table.
-- ---------------------------------------------------------------------
create view public.user_coverage
  with (security_invoker = true) as
  select
    k.user_id,
    count(distinct k.lemma_id) as known_count,
    (select count(*) from public.lemmas where qa_status <> 'draft') as total_count
  from public.known_lemmas k
  group by k.user_id;

-- =====================================================================
-- SECTION D — DYNAMIC DISTRACTOR FUNCTION (simple-now / upgradeable)
-- =====================================================================
-- v1 rule: same word_class + nearby freq_band, exclude target, random sample.
-- Mirrors the seed doc verbatim in intent. Upgrade path (no migration):
-- once semantic_field / phonetic_key are populated, extend the WHERE clause.
-- The full, canonical copy of this function also ships at
-- functions/get_distractors.sql for reference.
-- ---------------------------------------------------------------------
create or replace function public.get_distractors(target uuid, n int default 3)
returns setof public.lemmas
language sql
stable
as $$
  select *
  from public.lemmas
  where id <> target
    and word_class = (select word_class from public.lemmas where id = target)
    and freq_band between
        (select freq_band from public.lemmas where id = target) - 1 and
        (select freq_band from public.lemmas where id = target) + 1
    and qa_status <> 'draft'
  order by random()
  limit n;
$$;

-- =====================================================================
-- END 0001_init.sql  — RLS, policies, and Storage are in 0002_rls.sql.
-- =====================================================================

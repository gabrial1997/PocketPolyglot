# Database Schema Seed — Suggestions for Claude Code (Supabase / Postgres)

**Status:** DRAFT suggestions — NOT a locked schema. This document is a *seed* for Claude Code to build out. Treat every table, column, and policy as a recommended starting point to adapt, not a contract. A CTO + QA pass is recommended before it's locked into `/docs/technical/`.

**Stack:** Supabase (Postgres + Auth + Storage + Edge Functions), per `memory.md` tech direction. Speech/pronunciation ML scoring runs on a **separate inference service** — see §7.

**Companion docs:** the frontend contract is in `branding/.../design_handoff_pocketpolyglot/BACKEND_INTEGRATION.md` (the `ReviewItem` / `CardResult` shapes) and `WIRING_MAP.md`. This schema is the backend that fulfills those contracts. Where a column maps to a `ReviewItem` field, that's called out.

---

## 0. Design principles (carried from project decisions)

- **Content is a shared library; user state is per-user.** Two clean halves: read-mostly content tables (the ~1,000 words + phrases + pairs, identical for everyone) and per-user durable state (SRS schedule, known words, recordings). Cards never see either directly — services do.
- **Lemma-centric.** The base/dictionary form (lemma) is the unit of vocabulary. Inflected case forms are *wordforms* attached to a lemma. (See §3 — this is where the morphology decision lives.)
- **FSRS scheduling** (`ts-fsrs`) across all item types.
- **Dynamic distractors, simple-now/upgradeable** — multiple-choice options are NOT stored per item; they're selected at runtime (§5).
- **GDPR from day one** — recordings are personal data; Row-Level Security + consent gating from the first migration (§6, §7).
- **Stable identifiers** — keep the `CardKind` / `id`+`k` strings from the wiring map as the canonical keys for analytics and deep links.

---

## 1. Two-tier overview

```
CONTENT (shared, read-mostly)            USER STATE (per-user, RLS-protected)
─────────────────────────────           ──────────────────────────────────
lemmas            ← vocabulary           profiles        ← user + GDPR consent
wordforms         ← case forms           review_state    ← FSRS schedule per item
phrases           ← multi-word units     review_log      ← append-only result history
phrase_components ← unlock gating        recordings      ← voice blobs + ML scores
minimal_pairs     ← perception drills    known_lemmas    ← (view) gates phrase unlock
audio_assets      ← (HVPT multi-voice)
podcast_episodes  ← Tier-B listening
```

---

## 2. Content tables

### `lemmas` — the vocabulary unit

```sql
-- SUGGESTION — adapt types/constraints as needed
create table lemmas (
  id            uuid primary key default gen_random_uuid(),
  lemma         text not null,                 -- dictionary form, e.g. 'māja'  → ReviewItem.target
  gloss_en      text not null,                 -- 'house'                       → ReviewItem.gloss
  pron          text,                          -- 'MAH-ya'                      → ReviewItem.pron
  pos           text,                          -- 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | ...
  word_class    text not null,                 -- 'concrete' | 'abstract' | 'function'  (drives learn template)
  freq_rank     integer,                       -- lemma-frequency rank AFTER lemmatization (see §8)
  freq_count    integer,
  freq_band     smallint,                      -- bucketed rank (e.g. 1..10) — used for distractor selection (§5)
  cefr          text,                          -- optional A1/A2/...
  -- presentation payloads by word_class:
  media         jsonb,                         -- { imageUrl, imageUrlDark }  (concrete) → ReviewItem.media
  mnemonic      jsonb,                         -- { soundsLike, note }        (abstract) → ReviewItem.mnemonic
  examples      jsonb,                         -- [{ pre, w, post, en, audioUrl }] (function) → ReviewItem.examples
  -- UPGRADE columns for smarter distractors / drills (nullable now, fill later):
  semantic_field text,                         -- e.g. 'dwelling' — semantic distractors (§5 upgrade)
  phonetic_key   text,                         -- coarse phonetic shape — confusable distractors (§5 upgrade)
  qa_status      text not null default 'draft',-- 'draft' | 'native_ok' | 'locked'  (Elizabete QA)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on lemmas (freq_rank);
create index on lemmas (word_class, freq_band);   -- the distractor query path (§5)
```

Audio for the lemma: keep it simple now with `native_url` / `slow_url` columns **or** go straight to the `audio_assets` table (§4) if you want HVPT multi-voice from the start. Recommendation: start with two columns, migrate to `audio_assets` when HVPT voice count is decided (it's an open question in `memory.md`).

### `wordforms` — inflected case forms (the morphology decision lives here)

The curriculum teaches the **lemma first, then a capped set of high-frequency case forms as chunks**. Per the provisional decision (`memory.md` principle 10, 2026-06-14): **nominative + accusative + dative + locative are taught explicitly; genitive is incidental/chunk-first; instrumental has no distinct form; vocative is marginal.** Model that as data, not hard-coded logic, so the cutoff can change after validation:

```sql
create table wordforms (
  id           uuid primary key default gen_random_uuid(),
  lemma_id     uuid not null references lemmas(id) on delete cascade,
  form         text not null,                  -- the inflected surface form, e.g. 'mājā' (locative)
  gram_case    text not null,                  -- 'nom'|'acc'|'dat'|'loc'|'gen'  (no 'ins'/'voc' as distinct)
  number       text not null default 'sg',     -- 'sg' | 'pl'
  freq_count   integer,                        -- form-level frequency (from LVTB, §8)
  teach_mode   text not null default 'incidental', -- 'explicit' | 'incidental'
  created_at   timestamptz not null default now(),
  unique (lemma_id, gram_case, number)
);
create index on wordforms (lemma_id);
```

- `teach_mode = 'explicit'` for nom/acc/dat/loc; `'incidental'` for gen (and anything else) — a **data switch**, so changing the cutoff later = an UPDATE, not a code change.
- This table is also where the LVTB-computed form frequencies land (§8), which is what's needed before the morphology cutoff is locked.
- v1 can stay lean: explicit case forms mostly surface *inside phrase/example content* rather than as standalone FSRS items. If you later want to FSRS-track individual form mastery, `review_state` (§5-state) can reference a `wordform` item type — leave room for it, don't build it yet.

### `phrases` — multi-word units (the conversational vehicle)

```sql
create table phrases (
  id          uuid primary key default gen_random_uuid(),
  target      text not null,                   -- 'Es dzeru kafiju'  → ReviewItem.target
  gloss_en    text not null,                   -- 'I drink coffee'   → ReviewItem.gloss
  audio_url   text,
  is_idiom    boolean not null default false,  -- true ⇒ run 'phrase/meaning' MC (idioms only, literal ≠ actual)
  seed        text,
  qa_status   text not null default 'draft',
  created_at  timestamptz not null default now()
);
```

### `phrase_components` — unlock gating

A phrase unlocks only when **all** its component lemmas are "known" (the `i+1` gate). Model the membership explicitly so the controller can check it against `known_lemmas` (§5-state):

```sql
create table phrase_components (
  phrase_id  uuid not null references phrases(id) on delete cascade,
  lemma_id   uuid not null references lemmas(id),
  is_new     boolean not null default false,   -- the one allowed-unknown word under i+1 (≤1)
  position   smallint,                          -- ordering for display/highlight
  primary key (phrase_id, lemma_id)
);
```

### `minimal_pairs` — perception drills

```sql
create table minimal_pairs (
  id            uuid primary key default gen_random_uuid(),
  a             text not null,                 -- → ReviewItem.pair.a
  b             text not null,                 -- → ReviewItem.pair.b
  correct       char(1) not null check (correct in ('a','b')),
  audio_url     text not null,                 -- the stimulus actually played
  contrast_type text not null,                 -- 'L_vs_Ļ' | 'vowel_length' | ...
  qa_status     text not null default 'draft'
);
```

### `audio_assets` (optional / HVPT upgrade)

HVPT (High-Variability Phonetic Training) wants **many voices** for hard contrasts. When voice count is settled, normalize audio out of the content rows:

```sql
create table audio_assets (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null,                   -- 'lemma' | 'wordform' | 'phrase' | 'pair'
  owner_id    uuid not null,
  voice_id    text not null,                   -- which speaker (Elizabete, TTS voice X, ...)
  rate        text not null default 'native',  -- 'native' | 'slow'
  storage_path text not null,                  -- Supabase Storage path
  created_at  timestamptz not null default now()
);
create index on audio_assets (owner_type, owner_id);
```

---

## 3. User state tables

### `profiles` — user + GDPR consent

```sql
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  streak_count      integer not null default 0,
  settings          jsonb not null default '{}',   -- theme/accent/speed prefs, reduced-motion
  -- GDPR (see §6): recording + training consent, captured explicitly
  rec_consent       boolean not null default false,
  rec_consent_at    timestamptz,
  training_consent  boolean not null default false, -- permission to use recordings to train the model
  created_at        timestamptz not null default now()
);
```

### `review_state` — the FSRS schedule (one row per user per learnable item)

```sql
create table review_state (
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_type    text not null,                  -- 'lemma' | 'phrase' | 'pair'  (room for 'wordform' later)
                                                 -- NB: the frontend contract calls a word item ReviewItem.type='word';
                                                 -- the controller maps DB 'lemma' ⇄ contract 'word'. Keep that mapping in one place.
  item_id      uuid not null,
  stage        text not null default 'new',    -- 'new'|'learning'|'review'|'mature'  → ReviewItem.stage
  reps         integer not null default 0,     -- → ReviewItem.reps
  lapses       integer not null default 0,
  -- FSRS memory model:
  stability    double precision,
  difficulty   double precision,
  due_at       timestamptz,
  last_review  timestamptz,
  primary key (user_id, item_type, item_id)
);
create index on review_state (user_id, due_at);   -- getDueBatch() path
```

### `review_log` — append-only history (one row per `CardResult`)

```sql
create table review_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  item_type     text not null,
  item_id       uuid not null,
  card_kind     text not null,                 -- 'word/pic-review' etc. — the stable wiring-map key
  correct       boolean,                       -- ← CardResult.correct (null for learn cards)
  spoke         boolean,                       -- ← CardResult.spoke
  self_rating   text,                          -- 'good'|'again' ← CardResult.selfRating (phrase sayit)
  latency_ms    integer,                       -- ← CardResult.latencyMs
  recording_id  uuid references recordings(id),-- set if the user recorded
  interval_label text,                         -- the "next review in N days" string handed back to the card
  created_at    timestamptz not null default now()
);
create index on review_log (user_id, created_at);
```

### `known_lemmas` — phrase-unlock gate (a view, not a table)

Derive "known" from `review_state` so it can't drift:

```sql
create view known_lemmas as
  select user_id, item_id as lemma_id
  from review_state
  where item_type = 'lemma' and stage in ('review','mature');   -- tune the threshold
```

The controller unlocks a phrase when every `phrase_components.lemma_id` (except the ≤1 `is_new`) is in `known_lemmas` for that user. This is the `KnownWordsStore` from `BACKEND_INTEGRATION.md` §5.

### `recordings` — voice blobs + ML scores (GDPR-sensitive)

```sql
create table recordings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  storage_path  text not null,                 -- private Supabase Storage bucket
  duration_ms   integer,
  consent_at    timestamptz not null,          -- MUST be set at insert (no consent ⇒ no row)
  -- filled asynchronously by the external ML service (§7):
  score         double precision,
  score_payload jsonb,                         -- per-phoneme GOP, alignment, etc.
  created_at    timestamptz not null default now()
);
```

---

## 4. Tier-B (standalone) screens — not SRS items

`home`, `pod` (podcast), `prog` (progress) are NOT in the review loop (see `WIRING_MAP.md` §3):

- **`home`** — reads counts from `review_state` (due today, new vs review) + `profiles.streak_count`. No new table.
- **`prog`** — coverage = `count(distinct known lemmas) / count(lemmas)`. A view over `known_lemmas` + `lemmas`. No new table.
- **`pod`** — v1 episodes are **pre-generated shared content gated by coverage level**, not per-user generated (per-user is post-MVP). One table:

```sql
create table podcast_episodes (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  audio_url    text not null,
  transcript   text,
  level_band   smallint,                       -- min coverage band required to unlock
  lemma_ids    uuid[] ,                        -- words it was built from (all within level_band)
  created_at   timestamptz not null default now()
);
```

---

## 5. Dynamic distractors (simple-now, upgradeable) — your chosen approach

Multiple-choice options are **selected at runtime**, never stored on the item. v1 rule: same `word_class` + nearby `freq_band`, exclude the target, random sample. Implement as a Postgres function the controller calls (or replicate in an Edge Function):

```sql
-- SUGGESTION — v1 distractor picker
create or replace function get_distractors(target uuid, n int default 3)
returns setof lemmas language sql stable as $$
  select * from lemmas
  where id <> target
    and word_class = (select word_class from lemmas where id = target)
    and freq_band between
        (select freq_band from lemmas where id = target) - 1 and
        (select freq_band from lemmas where id = target) + 1
    and qa_status <> 'draft'
  order by random()
  limit n;
$$;
```

The controller builds `ReviewItem.choices` from `[target] + get_distractors(target)`, shuffles, and marks `correct`. **Upgrade path (no migration needed):** once `semantic_field` / `phonetic_key` are populated, extend the `where` clause to prefer same-semantic-field (for `word/say` meaning confusions) or same-phonetic-key (for `word/hear` sound confusions). This is why those columns exist now but stay nullable.

> Note: for `word/hear`, distractors are *glosses*; for `word/say`, distractors are *words*. Same picker, different field projected into `choices`.

---

## 6. Row-Level Security & GDPR (first migration, not later)

- **Content tables** (`lemmas`, `wordforms`, `phrases`, `phrase_components`, `minimal_pairs`, `audio_assets`, `podcast_episodes`): readable by any authenticated user; writes restricted to the `service_role` (content pipeline). `enable row level security` + a `select` policy for `authenticated`.
- **User tables** (`profiles`, `review_state`, `review_log`, `recordings`): RLS so `auth.uid() = user_id` for all operations. A user can only ever see/modify their own rows.
- **Recordings Storage bucket**: private; access via signed URLs only; RLS mirrors the `recordings` table. **Block inserts unless `profiles.rec_consent = true`** (enforce in the upload path / an Edge Function, and re-check in policy). Add a retention/delete policy and honor deletion requests — recordings are personal data. Project stance: *sell the model, not the data.*

---

## 7. The ML-service boundary (what is NOT in Supabase)

Pronunciation scoring (GOP on the Latvian phoneme recognizer) is a **separate inference service**. Flow:

```
card → RecorderService.stop() → upload blob to Storage bucket
     → insert recordings row (consent_at set)
     → notify external ML service (Edge Function or queue) with storage_path
     → ML service scores → writes score / score_payload back to recordings row
     → card shows result (the waveform/pitch compare in the mock is illustrative)
```

Supabase is the front door + store; it does not run the model. Keep LLM/ML keys server-side (Edge Functions), never in the client (`memory.md` constraint).

---

## 8. Seeding — depends on the curriculum pipeline (not buildable yet)

The DB structure can be built now; **populating it cannot**, because the curated word list doesn't exist. The pipeline:

1. **Raw** — `docs/linguistics/lv-frequency-top1000.csv` (wordforms, uncleaned). *Exists.*
2. **Lemmatize + clean** — collapse forms to lemmas (UDPipe / Stanza), strip subtitle junk, cross-check korpuss.lv, re-rank. Produces `freq_rank` / `freq_band` for `lemmas`. *Linguistics Expert — not done.*
3. **Case-form frequencies (LVTB)** — compute per-case counts → fills `wordforms.freq_count` and the `teach_mode` cutoff. **This is also the missing input that lets the morphology cutoff (nom/acc/dat/loc explicit) be locked** (see `docs/research/latvian-case-frequency-morphology.md`).
4. **Enrich** — per surviving lemma: gloss, `word_class`, audio (TTS + Elizabete native), image (concrete), mnemonic (abstract), examples (function). Build phrases + `phrase_components`, minimal pairs. Elizabete QA flips `qa_status` → `native_ok`.
5. **Seed** — load into the content tables; only `qa_status <> 'draft'` rows surface to learners.

So the recommended build order for Claude Code: **structure + RLS + the distractor function + the service interfaces now**; seeding waits on the linguistics track.

---

## 9. Open items for the CTO/QA pass (don't lock without resolving)

- FSRS state columns — confirm `ts-fsrs` field names map cleanly to `review_state` (stability/difficulty/due) and decide client-side vs Edge-Function scheduling.
- Whether to FSRS-track individual `wordforms` (adds an `item_type='wordform'`) or keep case forms inside phrases only — currently the lean default is phrases-only.
- `native_url`/`slow_url` columns vs `audio_assets` table from day one (driven by the open HVPT voice-count question).
- Distractor count `n` per `CardKind`, and whether `word/hear` vs `word/say` need different pools.
- Confirm the morphology cutoff (`wordforms.teach_mode`) once LVTB numbers + Elizabete's test are in — the schema supports any cutoff; only the data changes.

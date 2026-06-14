# Decision Log — PocketPolyglot App

> Condensed from the project `memory.md`. These are **settled** for the build. Treat them as
> locked until the founder explicitly reopens one. If a decision blocks you, surface it — do
> not silently re-litigate. Full rationale lives in the project root docs; pointers below.

## Stack

| Area | Decision | Notes |
|---|---|---|
| App | **Expo / React Native** (TypeScript) | Confirmed 2026-06-14. iOS-first, Android later. Mockups were React; speech ML lives in a backend service, so RN audio is sufficient for v1. |
| Backend | **Supabase** — Auth, Postgres, Storage, Edge Functions | Connector connected 2026-06-14. |
| Speech ML | **Separate inference service** (GOP / Latvian phoneme recognizer) | NOT Supabase, NOT this repo. Scores recordings asynchronously. |
| SRS | **FSRS** via `ts-fsrs` | Across all item types. 90% retention default. |
| Frequency list | OpenSubtitles FrequencyWords (spoken) + korpuss.lv | Lemmatize first; raw list is not curriculum-ready. |
| Keys | Proxied through backend Edge Functions | Never in the client. |

## Product / pedagogy

- **Audio-first, speaking-first.** Core loop: *audio in → meaning in → meaning out → audio out.*
- **NOT gamified.** No streaks, no confetti, no XP. The phrase-unlock chime is the only
  celebratory beat. Anti-Duolingo / anti-Motion: calm, premium, evidence-grounded.
- **Scope = Phase 0 + Phase 1.** Phase 0 = record + A/B self-compare + minimal-pair drills (no
  model). Phase 1 = GOP scoring via the external ML service. De-risk: if the GOP spike slips, v1
  ships Phase 1 with word-level Whisper feedback and GOP lands post-launch. Phase 2 is post-v1.
- **Content model:** pre-generated **shared library** for v1 (~1,000 words + phrases). Per-user
  / personalized generation is post-MVP.
- **Three vocabulary card templates:** concrete (image + audio), abstract (LLM keyword bridge +
  sentence + audio), function word (sentence context + audio).
- **Phrase unlock = i+1 gate:** a phrase unlocks when all its component lemmas are "known"
  except at most one new word.

## Morphology cutoff — 4 cases (provisional decision 2026-06-14)

- **Explicit:** nominative, accusative, dative, **locative** (locative promoted early — high
  conversational ROI: place/time; regular; chunk-friendly).
- **Incidental / chunk-first:** genitive.
- **No distinct form:** instrumental (= accusative sg. / dative pl.). **Marginal:** vocative
  (nominative-substitutable).
- Effective system is ~6 distinct / ~5 core cases, **not 7**.
- **Implemented as data, not code:** `wordforms.teach_mode` ('explicit' | 'incidental').
  Changing the cutoff is an UPDATE, not a code change.
- Pending before final lock (does not block build): LVTB case-frequency curve + Elizabete's
  case-error-tolerance test. Source: `docs/latvian-case-frequency-morphology.md`.

## Distractors (multiple-choice) — dynamic, runtime-selected (2026-06-14)

- **Not stored per item.** Selected at runtime: same `word_class` + nearby `freq_band`,
  exclude the target, random sample.
- **Upgrade path needs no migration:** `lemmas.semantic_field` / `lemmas.phonetic_key` columns
  exist now (nullable) for a later semantic/phonetic-similarity upgrade.
- For `word/hear` distractors are *glosses*; for `word/say` they are *words*. Same picker,
  different field projected into `choices`. Source: `docs/database-schema-seed.md` §5.

## Data & legal — GDPR from day one

- Voice recordings = personal data. Consent flow + privacy policy permitting model training +
  commercialization before any recording is collected. Opt-in, data-minimized.
- No `recordings` row without `consent_at`; private Storage bucket; RLS so `auth.uid() =
  user_id`; honor deletion requests. **Sell the model, not the data.**
- *Not legal advice — the founder should consult a lawyer (Latvian residency).*

## Architecture boundary (see CLAUDE.md + docs/BACKEND_INTEGRATION.md)

- **Cards are pure: data-in / events-out.** Services injected, never imported in cards.
- **`SessionController` is the only stateful piece**; `renderFor(item)` chooses the card.
- `CardKind` `id`+`k` strings are stable analytics / deep-link keys.

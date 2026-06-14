# PocketPolyglot — Handover (2026-06-14)

Pick-up doc for a fresh session. Read `CLAUDE.md` + `DECISIONS.md` first, then this.

## TL;DR — where we are
The **entire frontend, the live Supabase backend, auth, real audio playback, and a TTS content
pipeline are built and green** (CI + local). The app is a complete vertical slice that **runs and
signs in on the live backend** — but it has **no curriculum content yet**, so a session is empty.
Tomorrow's focus: **procure the top ~1000 words → generate TTS (male + female voices) → seed → play
real lessons.**

- Repo: `pocketpolyglot-app/` (the app; this is the git root, pushed to `github.com/gabrial1997/PocketPolyglot`).
- Latest commit: `e0e5c03`. 14 commits, every one CI-green. Suite: **116 tests** (2 jest projects).
- Live Supabase project ref: **`necfghfotwykjsykccsa`** (`https://necfghfotwykjsykccsa.supabase.co`).

## How to run / view the app
```bash
cd ~/workspace/pocketpolyglot/pocketpolyglot-app
npx expo start --tunnel          # @expo/ngrok is installed locally (--no-save); .env is set
```
Scan the QR with **Expo Go** (iOS: Camera app; if "no usable data", enlarge the terminal or use
Expo Go → "Enter URL manually" with the `exp://…exp.direct` URL). You'll get: **Sign-in (email
OTP)** → enter email → 6-digit code from email → **Home** ("0 new / 0 to review") + Podcast/Progress
tabs. Start session bounces (empty batch) — no content yet. Web preview is an option too
(`expo start --web`, needs `react-native-web` + `@expo/metro-runtime`).

`.env` (gitignored) is already populated with the Supabase URL + anon key. `OPENAI_API_KEY` lives in
`../.env` (parent dir) and is used by the TTS pipeline.

## What's built (by layer)
- **Design system / cards (Tier A):** every `CardKind` (`word/*`, `phrase/*`, `drill`, `pron`)
  ported as a PURE card (data-in `ReviewItem` / events-out `CardResult`), rendered from `item`, with
  RN snapshot + behavior tests. Theme (light/dark), primitives (PlayOrb/MicOrb/Waveform/SpeedChip/
  ChoiceButton/CtaButton).
- **Controller:** `SessionController` (`useSession`) + pure `renderFor()`; `CardHost` keyed on
  `item.id` so card state never leaks between items; `cardWiring.ts` maps card events → injected
  services (pure, unit-tested).
- **Tier-B screens:** `home`/`pod`/`prog` via hosts (`HomeHost`/`PodcastHost`/`ProgressHost`) that
  pull from their own services; minimal placeholder `TabBar`.
- **Backend (LIVE):** migrations `0001_init` + `0002_rls` + `0003_hardening` **applied** to the live
  project. 11 tables, RLS on all, GDPR consent gating, private `recordings` bucket. **Advisors
  clean** (0 security; only benign empty-table index INFOs). `database.types.ts` generated.
- **Real services:** `src/services/supabase/` — `SupabaseSrsService` / `KnownWordsStore` /
  `ProgressService` / `PodcastService` + pure mappers (row→ReviewItem, CardResult→FSRS rating,
  `ts-fsrs` scheduling; 22 mapper tests).
- **Auth:** email-OTP (`src/auth/AuthProvider.tsx`, `SignInScreen.tsx`); `AuthGate` in
  `navigation/index.tsx` swaps stubs → `createSupabaseServices(supabase, user.id)` on login.
  `supabaseClient` uses AsyncStorage for session persistence + a guarded URL.
- **Audio:** `ExpoAudioService` (expo-av) — `play(url,{rate})` with `shouldCorrectPitch`, so the
  SpeedChip "slow" = native clip at 0.7× with pitch preserved. Wired into the authed bundle.
- **Content pipeline:** `content-pipeline/tts.mjs` — `generate` (OpenAI `gpt-4o-mini-tts` → one mp3
  per item) and `seed` (upload to a public bucket + insert rows). `sample.json` is a throwaway
  phonetics probe — NOT the curriculum.

## Locked decisions (don't silently re-litigate — see DECISIONS.md)
- Cards are pure; services injected; `SessionController` is the only stateful piece; `CardKind`
  strings are stable analytics/deep-link keys.
- **No gamification** (the phrase-unlock chime is the only celebratory beat).
- GDPR: no recording row without consent; private bucket; `auth.uid()=user_id`.
- Morphology cutoff = 4 cases, lives in DATA (`wordforms.teach_mode`).
- **"Slow" audio = in-app pitch-corrected playback rate, not separate files** (decided 2026-06-14;
  the TTS "speak slowly" steering was unreliable).
- **Recorder owns the take:** cards call `onRecordStop()` with no arg; the controller merges the
  recording. (Deviates from BACKEND_INTEGRATION §4's `onRecordStop(blob)` on purpose.)
- FSRS rating is binary (Again/Good); mature at 21-day stability.

## CI / workflow
- CI = `npm run lint && typecheck && test && build`, must stay green on every change.
- A background CI watcher loop has been used per-session to auto-verify pushes (pings on red). Not
  running now — relaunch when building resumes.
- **Each live Supabase migration needs its OWN explicit user authorization** (the permission
  classifier blocks them individually). Don't batch-apply.
- Known minor debt: CI actions on Node 20 (GitHub deprecation), `@testing-library/react-native` v12
  deprecation, placeholder `TabBar` (a real navigator later).

---

# TODO — next session (ordered)

### 1. Procure the top ~1000 words  ← START HERE
Build `content-pipeline/frequency.mjs` (same shape as `tts.mjs`):
1. Pull OpenSubtitles Latvian frequency ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) `lv_full.txt`).
2. **Lemmatize** (essential for Latvian) via UDPipe [LINDAT REST API](https://lindat.mff.cuni.cz/services/udpipe/) (model `latvian-lvtb`) — collapse inflected forms → lemma + POS, sum counts.
3. Aggregate → rank → band (`freq_rank`/`freq_count`/`freq_band`). Clean: drop PROPN/NUM/foreign/
   profanity/interjections/subtitle artifacts.
4. LLM pass (OpenAI) to draft `gloss` (EN) + `word_class` (concrete/abstract/function) per lemma.
5. Output a **reviewable candidate `manifest.json`** of ~1200 lemmas (+ phrases later) for founder +
   Elizabete QA → lock the ~1000 (`qa_status`). NB: frequency ≠ teaching order; sequencing is a
   separate layer.

### 2. TTS — MALE + FEMALE voices (new requirement, 2026-06-14)
The user wants **two voices (one male, one female); the user can pick one, or mix & match.**
- Pick best-sounding Latvian voices from OpenAI's set — candidates: **male** = `onyx`/`ash`/`echo`,
  **female** = `nova`/`shimmer`/`coral`. A/B them on the hard sounds (ļ/ņ/ķ/ģ, ā/ē/ī/ū) before
  committing. Quality varies by voice.
- Extend `tts.mjs` to generate **both voices per item** → store in the **`audio_assets`** table
  (which exists for exactly this: `owner_type`/`owner_id`/`voice_id`/`rate`/`storage_path`).
  `voice_id` = `'male'`/`'female'` (or the OpenAI voice name). Keep `lemmas.native_url` as a default
  fallback (e.g., point at one voice).
- **App side:** add `voicePreference: 'male' | 'female' | 'mix'` to `profiles.settings`; the
  SRS mapper/service resolves the audio URL from `audio_assets` by the user's preference
  (`'mix'` = alternate voices across items — also good HVPT variety). Add a small settings toggle UI.
- Cost stays trivial (~2× of ~$2–5 → still well under $15 for two full-corpus voices).

### 3. Seed content + audio (LIVE — needs authorization)
- Get the **service_role key** (Supabase dashboard → Settings → API) into `../.env` as
  `SUPABASE_SERVICE_ROLE_KEY` (gitignored), then run `node content-pipeline/tts.mjs seed`
  (uploads to a public `content-audio` bucket + inserts rows). Each live write needs the user's OK.

### 4. New-card introduction in `getDueBatch`
A fresh user has no `review_state` rows, so a session is empty. Add: surface N new (unseen) lemmas/
day not yet in `review_state`. Without this, seeding alone won't show cards.

### 5. Then: real RecorderService + recording flow
`ExpoRecorderService` (mic + permission via expo-av), record → upload to the private `recordings`
bucket (path `recordings/<uid>/<id>`), insert a `recordings` row (`consent_at` set), behind a
**rec-consent UI** (`profiles.rec_consent`). Pronunciation scoring stays in the separate ML service.

### Smaller / later
- Bump CI `actions/*@v4` off Node 20; RNTL v12→v13; replace placeholder `TabBar` with a real
  navigator (expo-router); consider A/B-ing Tilde/ElevenLabs vs OpenAI for Latvian authenticity.

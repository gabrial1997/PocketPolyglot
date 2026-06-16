# PocketPolyglot — Handover v0.1.0 (2026-06-16)

> **This is the kickoff context for the next chat: POLISHING the app.**
> Read this, then `CLAUDE.md` (the non-negotiable boundary + locked product constraints) and
> `DECISIONS.md`. The older `HANDOVER.md` (2026-06-15) is pre-golden-slice — superseded by this
> for current state; still useful for the content/voice TODO backlog.

---

## TL;DR — where we are

The **golden-path vertical slice is built, live-verified, and merged to `main`.** One of every
reachable card type now renders from **real seeded Supabase content**, the phrase lock→unlock
flow works, both unique-character drills work (L/Ļ palatalization + the `ie` diphthong with the
GlideTrack), and **light + dark are both verified**. CI is green: **184 tests / 28 suites /
14 snapshots**, tsc + eslint clean.

**👉 NEXT TASK (this is what the next chat does): POLISH.** The founder walks the app on a real
iPhone (via `npm run phone` — already running, see below) and gives **per-screen polish notes** as
they move through it. The agent makes the edits; Fast Refresh shows them on the phone live. This is
visual/UX/copy refinement, **not** new architecture — keep the locked constraints intact.

- **Repo / branch:** `pocketpolyglot-app/` (git root, remote `github.com/gabrial1997/PocketPolyglot`).
  On **`main`** @ **`2374e90`**. The feature branch `chore/expo-sdk-54` was merged (fast-forward)
  and deleted. **Local `main` is 36 commits ahead of `origin/main` — NOT pushed yet** (founder
  chose a local merge). Push with `git push origin main` when ready.
- **Version:** `0.1.0` (package.json).
- **Live Supabase project ref:** `necfghfotwykjsykccsa` (`https://necfghfotwykjsykccsa.supabase.co`).
- **Test account (pre-confirmed):** `test@pocketpolyglot.dev` / `Polyglot123!`.

---

## How to preview while polishing (real iPhone)

**A tunnel is ALREADY LIVE from the prior session** — see `LIVE_SESSION.md` (gitignored scratch) for
the current `exp://…trycloudflare.com` URL, the QR command, the PIDs, and restart recipes. Fast
Refresh pushes edits to the phone automatically — **no re-scan needed** as you work.

If it has died / you're starting fresh:

```bash
npm run phone          # cloudflared tunnel + Metro + prints an Expo Go QR
```

Scan with the iOS **Camera** app (recent Expo Go on iOS has no in-app scanner / URL entry). Full
writeup + why `expo --tunnel` (broken @expo/ngrok) and LAN (WSL2 NAT) both fail: `docs/PHONE_PREVIEW.md`.

Web dev loop (faster for layout, not a shipping target): `npx expo start --web` + chrome-devtools
MCP (see the `run-and-view-app` skill; headless Chrome on `:9222`). Dark-mode audit gallery:
the app at `?preview` renders the `CardPreviewGallery` (every CardKind, both themes).

---

## The boundary you must NOT break while polishing (from CLAUDE.md)

- **Cards are pure: data-in (`ReviewItem`) / events-out (`CardResult`).** A card renders ONLY from
  `item` + `useTheme()`. It never imports a service, never fetches, never schedules. `SessionController`
  (`useSession`) is the only stateful piece. Polish = styling/layout/copy inside the card from theme
  tokens + item fields. Do not reach for a service or hardcode content to make a screen look right.
- **Theme tokens from the design system, never magic values.** Light + dark must both work — verify
  every visual change in BOTH (toggle on Home, or the `?preview` gallery). `docs/DESIGN_HANDOFF.md`.
- **`CardKind` `id`/`k` strings are stable** analytics/deep-link keys — don't rename them.

## Locked product constraints (polish must honor these — do NOT re-litigate)

- **Wrong answers do NOT advance.** Incorrect MC pick → chosen option turns **red**, copy is exactly
  **"Not quite — give it another try."**, selection resets, **correct answer is NEVER revealed**, no
  advance/unlock. Correct → green + advance. (Implemented across the MC cards — keep it.)
- **Progress = coverage, never points. NOT gamified.** No streaks/XP/leagues/confetti. The phrase-
  unlock **soft chime is the ONLY celebratory beat.** Calm, premium, restrained.
- **Live audio visualizer moves with REAL amplitude** (precomputed RMS envelope), not a timer fill.
- **Copy/brand:** no time claims ("ten minutes a day"); never the literal word **"quiet"** in UI;
  Home greeting name is **"Gabrial"** (comes from the signed-in user — the test account shows
  "Test", that's expected, not a bug); tone serious/literate/encouraging, never gamified.
- **GDPR from day one:** no recording row without `profiles.rec_consent`; recordings bucket private.

---

## What's seeded & what renders (golden slice)

Seeded via `content-pipeline/seed-golden-slice.mjs` (+ `golden-slice.json` manifest) into the live
project: ~lemmas + 3 phrases + 2 drill pairs, all `qa_status: native_ok`, `freq_band: 1`, with
**12 `review_state` rows** (`stage: 'new'`, including the pair/drill rows). Idempotent — re-run to
restore a pristine deck (it wipes + re-inserts `review_state`). Needs `SUPABASE_SERVICE_ROLE_KEY`
in `../.env`. The seeder also uploads the **unlock chime** to `content-audio/sfx/unlock-chime.wav`.

**Live-verified rendering (LIGHT + DARK), all 10 reachable kinds:** `word/hear` (+ wrong-answer
rule), `word/learn-{concrete|abstract|function}`, `word/say` (record → two real RMS-envelope
waveforms in A/B self-compare), `phrase/hear`, `phrase/sayit`, `phrase/locked` (i+1 gate + Continue
button), `drill` (L/Ļ + try-again), `diphthong` (`ie`, GlideTrack).

**Known scope limits (carried — NOT bugs, don't "fix" by hacking):**
- `word/pic-review` never appears live (no images seeded) — exercised only in the gallery + tests.
- `phrase/meaning` is idiom-only routing (no idiom phrase seeded) — gallery + tests only.
- `phrase/unlock`'s in-session reveal needs mid-session known-set mutation + batch re-queue
  (out of slice scope) — wired for correctness, seen only in the gallery.

---

## Architecture quick map (where polish lands)

- **Cards (Tier A):** `src/screens/*` — `WordHear`, `WordLearn*`, `WordSay`, `PhraseHear`,
  `PhraseSayit`, `PhraseLocked`, `PhraseUnlock`, `PhraseMeaning`, `Drill`, `Diphthong`. Each pure,
  snapshot-tested. **Most visual polish happens here.**
- **Primitives / design system:** `src/components/*` (PlayOrb/MicOrb/Waveform/GlideTrack/
  ChoiceButton/CtaButton/…) + theme in `src/theme` (`useTheme`, tokens). Polish shared look here.
- **Tier-B screens (own services, NOT ReviewItem/CardResult):** Home/Podcast/Progress via
  `HomeHost`/`PodcastHost`/`ProgressHost`. Home was redesigned to the mockup (serif greeting, Today's
  Session card, podcast row, coverage bar, light/dark toggle, Today/Listen/Progress tabs).
- **Controller / routing:** `src/session/` — `sessionController.ts`, `decideKind.ts`, `renderFor.ts`,
  `cardWiring.ts` (card events → injected services; chime + unlock auto-advance live here).
- **Services (live):** `src/services/supabase/` — `SupabaseSrsService` (+ pure `mappers`),
  `KnownWordsStore`, `ProgressService`, `PodcastService`. `getDueBatch` reads ONLY `review_state`
  rows; order = lemma → phrase → pair(drill) last.
- **Migrations:** `0001_init` → `0005_content_envelope` all applied live. Each live migration needs
  its OWN explicit user authorization (the permission classifier blocks them individually).

---

## CI / workflow (keep green on every change)

```bash
npx tsc --noEmit && npx eslint . && npx jest      # the full gate; all currently green (184 tests)
```

- Cards are pure → snapshot/behavior tested with fixture `ReviewItem`s, no live services. If a polish
  edit changes a card's rendered output, the snapshot will fail — **review the diff and update the
  snapshot intentionally** (`jest -u`), don't blindly accept.
- Commit/push only when the founder asks. Commit-message trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Loose ends / parked

- **Not pushed:** local `main` is 36 ahead of `origin/main`; remote `origin/chore/expo-sdk-54` still
  exists on GitHub (delete later: `git push origin --delete chore/expo-sdk-54`).
- **`.gitignore`** has the `LIVE_SESSION.md` ignore rule committed in this same docs commit.
- **Voice (blocking real content):** waiting on Elizabete re ElevenLabs (clone her native voice =
  the win; ~$7 / one Creator-plan month for the full corpus). Until then, golden-slice audio is
  OpenAI TTS. Male+female voice requirement + provider comparison: see `HANDOVER.md` TODO #2.
- **Content track (separate from polish):** the real top-1000 list (`words/` in the workspace-root
  repo) is drafted but needs Elizabete's native sign-off before broad seeding.
- **Smaller debt:** dead `nowUnlocked` field in `decideKind`; drill-vs-diphthong "say it back" CTA
  copy is slightly inconsistent; CI `actions/*` on Node 20; placeholder `TabBar` (real navigator later).

---

## Suggested first moves for the polishing chat

1. Read `CLAUDE.md` + this file. Confirm the phone preview is live (`LIVE_SESSION.md`) or run
   `npm run phone`. Sign in with the test account; open a session.
2. Walk the deck on the phone with the founder; capture polish notes **per screen**.
3. For each note: edit the card/primitive/theme token → Fast Refresh verifies on the phone →
   check the OTHER theme → run the gate (`tsc && eslint && jest`, update snapshots intentionally).
4. Batch related edits into focused commits (only when asked). Keep the deck pristine by re-running
   the seeder if any live `review_state` got mutated by walking the flow.

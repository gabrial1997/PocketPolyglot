# Plans — start here (fresh-session kickoff)

## ▶ Active plan: the "Golden Path" vertical slice

**Kick it off with:**

> Execute `docs/superpowers/plans/2026-06-16-vertical-slice-golden-path.md` with
> subagent-driven development.

That plan builds **one of every card type from real seeded content + the phrase lock→unlock flow +
the two unique-character drill cards (L/Ļ and the new `ie` diphthong), polished in light + dark.**
It is self-contained — a cleared-context agent needs nothing from prior chats.

### Read first (the plan cites these)
- `CLAUDE.md` — the card boundary (pure data-in/events-out) + locked product constraints.
- `docs/superpowers/specs/2026-06-16-vertical-slice-golden-path-design.md` — the design/spec.
- `../handover/drill_cards_handoff/` — the founder's **drill-card mockups** (`README.md`,
  `screens-drill.jsx`, `Drill Cards Preview.html`). Port the visuals **verbatim**.
- `docs/BACKEND_INTEGRATION.md` (§2–4) + `docs/WIRING_MAP.md` (§1–3) — contracts + the card map.

### Prerequisites
- Run all commands from `pocketpolyglot-app/`. Keep CI green every task: `npx tsc --noEmit`,
  `npx eslint .`, `npx jest`.
- Env (Tasks 12–13 only): `OPENAI_API_KEY` (in `../.env`) for TTS, `SUPABASE_SERVICE_ROLE_KEY` for the
  seed. Supabase project `necfghfotwykjsykccsa` (matches the app's `EXPO_PUBLIC_SUPABASE_URL`).
- **Test account** (already created, email pre-confirmed): `test@pocketpolyglot.dev` / `Polyglot123!`.
- **Review loop:** use the `run-and-view-app` skill (web preview on :8081 + headless Chrome on :9222 +
  chrome-devtools MCP). Phone preview = `npx expo start --tunnel`, scan with Expo Go (the iOS bundle is
  large — first load over the tunnel is slow; pre-warm by curling the bundle once).

### Task-ordering gotcha (from the plan's own note)
`'diphthong'` registration (Task 2) imports the screen built in Task 9. Order:
**Task 1 → Task 8 (GlideTrack) → Task 9 (DiphthongDrillScreen) → Task 2 → Task 3 → 4 → 5 → 6 → 7 → 10 → 11 → 12 → 13 → 14.**

### Before you start: confirm the `get_distractors` RPC signature
Task 6 calls `client.rpc('get_distractors', …)`. Confirm the exact arg names + return columns against
`supabase/migrations/` first (the plan flags this) and adjust the call to match.

### Out of scope for this slice (don't build here)
Full 1,000-word content · image-sourcing for concrete words · CSV→Supabase bulk importer · the
ElevenLabs/native voice decision + full-corpus audio + Elizabete QA · real mic recording + GOP scoring
(Phase 1) · FSRS-at-scale testing · onboarding/empty states. The slice de-risks all of these.

---

## Done / context
- **Home screen redesign** — shipped (commit `3e39b5f`): mockup-matched home in light/dark, persisted
  theme toggle, name from the signed-in user, Spectral serif now loads app-wide.
- All content data (the 1,000 ranked words + 273 phrases + sound work) lives one level up in `../words/`
  and `../handover/`; the word/phrase ranking pipeline is its own repo at the workspace root.

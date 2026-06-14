# Kickoff Prompt — paste this into Claude Code to start building

> Copy everything in the fenced block below into Claude Code in this repo. It encodes the build
> order and the guardrails. The single most important instruction is **STEP 0**.

---

```
You are building PocketPolyglot — an audio-first, speaking-first iOS app (Expo / React Native +
TypeScript) that teaches casual conversational Latvian. Read CLAUDE.md and DECISIONS.md before
writing anything. The contracts you must honor are in docs/BACKEND_INTEGRATION.md and
docs/WIRING_MAP.md. Do not deviate from the locked constraints.

STEP 0 — GREEN THE CI PIPELINE BEFORE ANY FEATURE WORK. This is the definition of "ready to
start." Do this first and do not begin feature work until it is done:
  1. Run `npm ci` (or `npm install`) and resolve any install issues on the scaffold.
  2. Make `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` ALL pass on
     the bare scaffold — add a trivial passing test if there are no tests yet so `jest` exits 0.
  3. Confirm .github/workflows/ci.yml runs the same four scripts. A passing pipeline (locally
     and in CI) is the gate. Treat "CI is green" as the signal that the project is ready to build
     on. Report the green state before moving on.

THEN proceed in this exact order (this refines docs/WIRING_MAP.md §6):
  1. DESIGN SYSTEM from theme tokens. Port `ppTheme` (colors, spacing, type scale) from the
     design tokens (docs/DESIGN_HANDOFF.md) into a theme context. Build the RN primitives:
     PlayOrb, MicOrb, Waveform, SpeedChip, choice button, CTA. Get light + dark switching
     working BEFORE any screen.
  2. TYPES + CONTROLLER. Define the `ReviewItem` / `CardResult` TypeScript types and the
     `SessionController` with `renderFor(item)` exactly per docs/BACKEND_INTEGRATION.md §2-3 —
     but have renderFor return an RN route/screen, not a web router component. Unit-test
     renderFor() directly (it is pure logic).
  3. CORE LOOP CARD end-to-end: port `word/pic-review` (picture+audio in → pick → say → result →
     SrsService.submit). This single card exercises every service and proves the boundary. Use
     docs/WIRING_MAP.md §1 to find the file, §4 for the prop signature, and the "sample data to
     replace" column to know what to delete.
  4. REMAINING CARDS, one CardKind at a time, top of the docs/WIRING_MAP.md §1 table down. Then
     the Tier-B standalone screens (home, pod, prog) with their own services — NOT
     ReviewItem/CardResult.
  5. SUPABASE WIRING behind the injected services (SrsService, AudioService, RecorderService,
     KnownWordsStore). The schema seed is docs/database-schema-seed.md — adapt it; it is
     suggestions, not a contract. Pronunciation scoring stays in the separate ML service.

NON-NEGOTIABLE RULES (do not break these for any reason):
  - Never break the card data-in / events-out boundary. Cards are pure: they receive a
    ReviewItem + callbacks and emit a CardResult. They own ONLY ephemeral UI state. Services are
    injected, never imported in a card. SessionController is the only stateful piece.
  - No gamification. No streaks, no confetti, no XP. The phrase-unlock chime is the only
    celebratory beat.
  - GDPR: no recording is stored without explicit consent; recordings bucket is private.
  - Keep CI green on EVERY change. Practice TDD where practical — cards are snapshot-testable
    with fixture ReviewItems precisely because they are pure.
  - Keep the CardKind id+k strings stable (analytics / deep-link keys).
  - Morphology cutoff is 4 cases (nom/acc/dat/loc explicit, genitive incidental) and it lives
    in DATA (wordforms.teach_mode), not code.

When in doubt, prefer the leanest path that keeps CI green and respects the boundary. Surface
any decision that DECISIONS.md does not cover instead of guessing.
```

---

## Why STEP 0 first

A passing CI pipeline is the cheapest possible guardrail and the only honest signal that the
scaffold is sound. Standing it up before feature work means every subsequent change has a known-
good baseline to compare against — a red pipeline after a feature change unambiguously points at
that change. It also forces the toolchain (lint/typecheck/test/build) to be real and reproducible
on a clean checkout before any complexity is layered on. **A green pipeline is the definition of
"ready to start."**

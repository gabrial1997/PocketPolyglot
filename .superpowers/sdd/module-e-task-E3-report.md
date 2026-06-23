# Module E — Task E3 Report: Consent-Aware A/B Compare + Self-Rate

**Status:** DONE

**Commit:** `7b344d4` — `feat(recorder): consent-aware A/B compare + self-rate on word/say, phrase/sayit, pron`

## Full-suite result
- Tests: **806/806 pass** (105 suites), main checkout
- Typecheck: clean (`tsc --noEmit` no output)
- Lint: clean (`eslint .` no output)

## Per-card: record affordance hidden when recConsent=false

**WordSay (`word/say`):**
- `recConsent = true` (default): MicOrb + "Now say it" caption shown on speak stage; full record→result flow unchanged
- `recConsent = false`: MicOrb hidden; speak stage shows a "Continue" CtaButton instead of the footNote "Speaking it closes the loop."; pressing Continue advances to result/compare; both CompareRows still render
- Emits: `{ itemId, cardKind:'word/say', correct, spoke:true }` in both cases

**PhraseSayIt (`phrase/sayit`):**
- `recConsent = true`: MicOrb + "Tap to record" hint shown on cue/rec stage
- `recConsent = false`: MicOrb + hint hidden; "Show the phrase" button still reaches compare stage; self-rate good/again still works
- Emits: `{ itemId, cardKind:'phrase/sayit', spoke:true, selfRating }` in both cases

**PronounceScreen (`pron`):**
- `recConsent = true`: Record pressable shown; full Record→Compare flow works
- `recConsent = false`: Record pressable hidden; Native row still visible and tappable; no crash
- Positive test confirms: `onPlayCompare('native')` then `onPlayCompare('you')` called in order
- Emits: `{ itemId, cardKind:'pron', spoke:true }` in both cases

## Controller wiring
`SessionHost` (`src/navigation/index.tsx`) calls `services.profile.getRecConsent()` once in a `useEffect` on mount. Default is `true` (permissive) until the async call resolves; network failure → `false`. The resolved boolean is passed as `recConsent` prop to `CardHost`, which spreads it to the three recording cards. **No card imports any service** — cards receive the boolean as data only.

## Snapshots updated
None — all existing snapshot tests render with `recConsent` at its default (`true`/`undefined`), so output is identical to before. The 30 existing snapshots all passed unchanged.

## Confirmations
- No service import in any card file (WordSay, PhraseSayIt, PronounceScreen)
- No score/ML/Whisper/GOP/transcribe anywhere in E3 changes
- Self-rate exists only on `phrase/sayit` — not added to `word/say` or `pron`
- No leftover worktree (`.claude/worktrees/agent-a984f17a710a77ed6` removed; branch `worktree-agent-a984f17a710a77ed6` deleted)
- `recConsent` defaults to `true` (permissive) — existing fixtures/snapshots unaffected

## Implementation note on cherry-pick
The worktree agent ran on a branch based on `main` (not `feat/core-loop`), so its commit was cherry-picked onto `feat/core-loop`. A conflict in `WordSay.test.tsx` was resolved by keeping both the translationVisibility gating tests (Module C5, from HEAD) and the new recConsent gate tests (from E3). `WordSay.tsx` itself auto-merged correctly, retaining both the `shouldShowGloss` / `translationVisibility` logic and the new `recConsent` guard.

## E3 fixes (2026-06-23 review pass)

### Fix 1 — Pron native audio playable without consent

**Change (`PronounceScreen.tsx`):** When `recConsent=false`, the Native row is now wrapped in a `Pressable` (`accessibilityLabel="Play native audio"`) that directly calls `onPlayCompare?.('native', speed)`. When `recConsent=true`, the row renders unwrapped as before (Compare drives the A/B sequence). This keeps the with-consent A/B flow (native → you via `doCompare`) completely unchanged.

Previously, the only way to invoke `onPlayCompare` was the Compare button, which is `disabled={!recorded || comparing}`. With `recConsent=false`, `recorded` is permanently false (no Record control visible), so Compare was permanently disabled — native audio was unreachable.

### Fix 2 — Real test that fails without the fix

**Change (`PronounceScreen.test.tsx`):** Replaced two vacuous tests ("no crash on render", "Native text visible") with a single substantive test: `recConsent=false: pressing the native play affordance calls onPlayCompare("native")`. It uses `getByLabelText('Play native audio')` and asserts `onPlayCompare` was called with `'native'`. The test would fail without Fix 1 because `getByLabelText` throws (the pressable doesn't exist), and even if found, the callback path didn't exist.

Also asserts that `onPlayCompare` is **not** called with `'you'` — confirming the 'you' leg is never attempted when there is no recording.

The with-consent positive test (`recConsent=true: Record → Compare flow emits { cardKind:pron, spoke:true }`) is kept intact, confirming native→you A/B ordering.

### Fix 3 — Tighter WordSay no-consent complete test

**Change (`WordSay.test.tsx`):** The `recConsent=false: card can still complete` test previously used `expect.objectContaining({ cardKind: 'word/say', spoke: true })`, which allowed `correct` to be absent or wrong. Updated to `expect.objectContaining({ itemId: 'maja', cardKind: 'word/say', correct: true, spoke: true })` to match the strictness of the with-consent test.

### Fix 4 — Merged duplicate imports in navigation/index.tsx

`ServiceProvider` and `useServices` were imported in two separate statements from `'../services/ServiceProvider'`. Merged into one: `import { ServiceProvider, useServices } from '../services/ServiceProvider'`.

### Fix 5 — Fail-closed GDPR comment

Added one-line comment above the `.catch(() => setRecConsent(false))` in `SessionHost`: `// Deliberately fail-closed (GDPR): if consent cannot be confirmed, recording is disabled.` — clarifying why the catch path sets `false` rather than leaving the `useState(true)` permissive default in place.

### Verification
- `npx jest PronounceScreen WordSay`: 27/27 pass (including the new native-play test)
- `npx jest --no-coverage`: 486/486 pass, 60 suites
- `npm run typecheck`: clean
- `npm run lint`: clean
- Snapshot for `PronounceScreen` unchanged (fix only affects the `recConsent=false` code path; default render is `recConsent=true` per the snapshot fixture)
- No leftover worktrees

# Module D Gate Report — D3c + D4

**Status:** DONE

## Commits

- `feat(d3): OnboardingGate sequencing + record-affordance consent gate`
- `test(d): onboarding + consent gate integration coverage`

## Full-suite result

- Tests: 453 passed / 453 total (58 test suites)
- Typecheck: clean (`tsc --noEmit`)
- Lint: clean (`eslint .`)

## Behavior confirmed

- **ensureProfile→getProfile on mount:** `OnboardingGate` calls `profile.ensureProfile()` then `profile.getProfile()` in sequence on mount. The `ensureCount` assertion in `OnboardingGate.test.tsx` and the integration test both verify this.
- **Orientation shown once then respects flag:** New users (`seenDiacritics: false`) see `DiacriticOrientationScreen`; pressing "Got it" calls `setSeenDiacritics()` (fire-and-forget) and sets state to `done`, rendering children. Returning users (`seenDiacritics: true`) bypass orientation entirely.
- **useRecordingAllowed defaults false until rec_consent true:** The hook initializes to `false` synchronously and only flips to `true` after `profile.getRecConsent()` resolves `true`. Errors are swallowed (fail-safe GDPR default stays `false`).

## Navigation wiring

`src/navigation/index.tsx` — `AuthGate`'s authenticated branch:

```tsx
return (
  <ServiceProvider services={services}>
    <OnboardingGate>
      <Root />
    </OnboardingGate>
  </ServiceProvider>
);
```

`OnboardingGate` is imported from `../onboarding/OnboardingGate`.

## New files

- `src/onboarding/OnboardingGate.tsx` — gate component (loading → orientation? → children)
- `src/onboarding/OnboardingGate.test.tsx` — 4 unit tests
- `src/onboarding/useRecordingAllowed.ts` — hook (GDPR consent gate)
- `src/onboarding/useRecordingAllowed.test.tsx` — 4 unit tests
- `src/onboarding/onboarding.integration.test.tsx` — 5 integration tests (D4)

## Report file

`/home/gabrial1997/workspace/pocketpolyglot/pocketpolyglot-app/.superpowers/sdd/module-d-gate-report.md`

## Concerns

None. The worktree was branched off an old commit and required rebasing onto the D3 tip (`7e5cbcb`) before the `DiacriticOrientationScreen` and `ConsentScreen` screens were available. After rebase, all tests passed cleanly. The GDPR DB gate is not weakened — `useRecordingAllowed` defaults to `false` and only the UI fronts it.

---

## D3c fixes (commit `84e652c`)

### useRecordingAllowed — hook contract

`useRecordingAllowed` reads consent **once on mount** via `useEffect` with a `[profile]` dependency array. It does NOT subscribe to live changes — mutating the service object's internal state (e.g. calling `setRecConsent(true)` on the same instance) does not re-trigger the hook. A re-read only occurs if the `profile` reference itself changes (i.e. a remount with a new `ServiceProvider`/service instance). This is intentional: consent changes happen via the Settings screen, which will cause a full subtree remount in practice.

### Toggle test — before and after

**Before:** The `ReRenderHarness` test called `new FakeProfileService({ recConsent: enabled })` on every render inside the component body. Pressing "Enable consent" toggled React state → re-render → new service instance with `recConsent: true` → new `ServiceProvider` ref → hook triggered via `[profile]` dep change. This tested "fresh mount with recConsent=true", NOT a genuine mid-session live flip.

**After:** Two tests replace the old one:

1. **`shows record affordance when consent is already true on mount (remount path)`** — holds a stable `FakeProfileService({ recConsent: false })`, asserts initially blocked (catches default-true regression), then passes a NEW `FakeProfileService({ recConsent: true })` instance via `rerender`. This triggers the `[profile]` dep in the hook exactly as a real Settings-screen remount would, and correctly exercises the hook re-reading on a changed profile reference.

2. **`does NOT show record affordance when consent is mutated on a stable instance without remount`** — uses a single `stableProfile` instance, calls `stableProfile.setRecConsent(true)` in `act(...)`, then asserts the button is still absent. This explicitly documents the read-once contract and will serve as a sentinel: if `useRecordingAllowed` ever gains a live-update subscription, this test must be updated to assert `'allowed'`.

Both tests would fail if the hook defaulted to `true` (the blocked assertion in test 1 would fail immediately).

### Color-token change (OnboardingGate loading state)

Removed `color: '#888'` (raw hex) from the `loadingText` StyleSheet entry. The component now calls `useTheme()` and applies `{ color: T.sub }` inline — `T.sub` is the theme's subtle-text token (`rgba(26,39,51,0.58)` in light, `rgba(234,241,248,0.60)` in dark), matching the pattern used by `SessionPlaceholder` in `src/navigation/index.tsx` which uses `T.faint`. `sub` was chosen over `faint` because it's slightly stronger (58% vs 34% opacity), matching the legibility needed for a centred loading label.

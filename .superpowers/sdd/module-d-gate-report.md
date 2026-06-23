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

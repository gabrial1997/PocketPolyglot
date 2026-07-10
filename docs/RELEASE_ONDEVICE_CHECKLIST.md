# Release On-Device Checklist

Run this against the **TestFlight build** (see `docs/RELEASE_RUNBOOK.md` step 4), on a real
iOS device, before submitting for App Store review. Use two accounts as noted — one fresh
sign-up per pass so both the consent-accept and consent-decline paths get exercised.

Coverage note: there is no in-app route that fabricates coverage from zero. To exercise the
"≥25% coverage" states below, use a test account whose `review_state`/`review_log` rows have
already been seeded to ≥25% coverage via Supabase (SQL), separate from anything reachable in
the UI. Settings → Developer's "Skip to next day" only advances the simulated clock (FSRS due
dates / daily caps) — it does not create coverage by itself.

## Onboarding — account A (consent accept path)

- [ ] Fresh sign-up with a brand-new email completes without error.
- [ ] Diacritics orientation screen ("Got it") appears immediately after sign-up.
- [ ] After dismissing it, the consent screen ("Recording your speech") appears.
- [ ] Tap **"Allow recording"** — the screen advances into the app (Today tab).
- [ ] Sign out and sign back in with the same account: neither the diacritics screen nor the
      consent screen reappears (both are one-time, `seenDiacritics`/`seenConsent`).
- [ ] In Settings → Profile → Privacy, "Recording consent" shows as enabled for this account.

## Onboarding — account B (consent decline path)

- [ ] Fresh sign-up with a second brand-new email; diacritics screen appears and dismisses
      the same way.
- [ ] On the consent screen, tap **"Not now"** — the screen advances into the app without
      recording being enabled.
- [ ] In Settings → Profile → Privacy, "Recording consent" shows as disabled/off for this
      account (fail-closed default held).
- [ ] Sign out and back in: neither onboarding screen reappears for this account either.

## Listen tab — coverage states

- [ ] On an account below 25% coverage, the Listen tab shows the **locked screen**, not the
      player.
- [ ] The locked screen shows a live coverage percentage (e.g. "You can follow N% of everyday
      speech so far") that matches the account's actual coverage, and a fill bar sized to it.
- [ ] On a test account seeded to ≥25% coverage with zero eligible episodes, the Listen tab
      shows the unlocked player in its empty state: **"No episode yet"**, not the locked
      screen.
- [ ] With coverage ≥25% but the device in **Airplane Mode** (or otherwise offline) on app
      launch: the Listen tab shows a **retryable error state**, not the locked screen and not
      the unlocked player — confirm a coverage-fetch failure never falls through to "unlocked."
- [ ] Turn networking back on and tap retry: the correct state (locked or unlocked, per actual
      coverage) resolves.

## Settings

- [ ] **Help & feedback** opens the device's mail composer addressed to the support email.
- [ ] **Privacy policy** opens the published privacy page in-browser.
- [ ] **Support site** opens the published support page in-browser.
- [ ] **Change password** sends a reset email — check the account's inbox and confirm the
      email arrives.
- [ ] **Delete my recordings** (Settings → Profile → Privacy) completes without error (or
      shows "Delete failed — tap to retry" and recovers on retry if it fails once).
- [ ] **Delete account** (Settings → Profile → Security) requires two taps: first tap arms it
      ("Tap again to permanently delete your account"), second tap within the window deletes
      the account.
- [ ] After deleting, the app signs the user out automatically.
- [ ] The old email/password combination fails to sign in after deletion.
- [ ] Signing up again with the **same email** succeeds (fresh onboarding: diacritics +
      consent screens both reappear, since this is a new account).

## Theme

- [ ] Full pass through onboarding + Today tab + Listen tab + Settings in **light** mode —
      no unreadable text/contrast issues.
- [ ] Same pass in **dark** mode (Settings → Appearance, or device-level "System" with the
      device set to dark).

## Content edge cases

- [ ] Find a phrase card whose native audio hasn't been recorded yet (an "audio-less"
      phrase) — confirm it renders normally (phrase text + breakdown) with a play orb that
      does not error or crash when tapped; it simply does not produce sound.

## Bug reporter

- [ ] The 🐞 floating button is visible on Today, Listen, Settings, and during onboarding.
- [ ] Tapping it opens the "Report a bug" sheet with a screenshot attached; typing a note and
      tapping "Send report" submits without error.

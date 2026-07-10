# Release Runbook — App Store v1.0.0

Founder-facing procedure for shipping PocketPolyglot's first App Store release. Steps
marked **YOU** require founder credentials (Apple Developer account, Expo/EAS login) and
cannot be done by an agent. Everything else is a concrete command or a paste-ready draft.

Companion doc: `docs/RELEASE_ONDEVICE_CHECKLIST.md` — run it against the TestFlight build
(step 4) before submitting for review.

---

## 1. Prereqs (YOU)

- [ ] Enroll in the **Apple Developer Program** ($99/yr) at https://developer.apple.com — this
      is required before EAS can create App Store credentials or App Store Connect can accept
      a submission.
- [ ] Create/sign in to an **Expo account**, then install the CLI and log in locally:
      ```bash
      npm i -g eas-cli
      eas login
      ```
- [ ] **Resolve GitHub issue #5** (the real support email). Once you have the address:
      1. Update `src/config/support.ts` — replace the placeholder
         `SUPPORT_EMAIL = 'REPLACE-ME-issue-5@pocketpolyglot.app'` with the real address.
      2. Republish the gh-pages support/privacy pages (Task 9) so the "Contact us" text on
         those pages matches.
      3. Commit and close issue #5.
      This is the **only** placeholder in this runbook — do not submit to App Store review
      with the placeholder still in place (Apple will try to email it).

## 2. Version bump

Before building, bump the version in **both** files (they are not linked automatically):

- [ ] `app.config.ts` — change `version: '0.1.2'` → `version: '1.0.0'`.
- [ ] `package.json` — change `"version": "0.1.2"` → `"version": "1.0.0"`.

Note: `eas.json` sets `"appVersionSource": "remote"` and `production: { autoIncrement: true }`,
so EAS (not `app.config.ts`'s `ios.buildNumber`) owns the iOS **build number** and increments it
automatically on every production build. You only need to bump the human-facing `version`
string above — do not hand-edit `ios.buildNumber` for this release.

```bash
git add app.config.ts package.json
git commit -m "chore(release): bump version to 1.0.0"
```

## 3. Build

```bash
eas build -p ios --profile production
```

- First run walks you through Apple credentials/certificates interactively — accept the
  EAS-managed defaults (let EAS create/manage the distribution certificate and provisioning
  profile) unless you already maintain your own in the Apple Developer portal.
- The `production` profile has `autoIncrement: true`, so each build gets a fresh build number
  without you touching config.
- `ITSAppUsesNonExemptEncryption: false` is already set in `app.config.ts` — export compliance
  is pre-declared, no prompt expected on this front (see step 6).

## 4. TestFlight sanity (YOU)

- [ ] Submit the build to TestFlight:
      ```bash
      eas submit -p ios
      ```
- [ ] In App Store Connect → TestFlight, wait for the build to finish processing, then install
      it on a real iOS device.
- [ ] Run the full **`docs/RELEASE_ONDEVICE_CHECKLIST.md`** against that TestFlight build.
      Do not proceed to step 5/6 until every item on the checklist passes.

## 5. App Store Connect metadata

Paste-ready drafts — brand voice: coverage-framed, leads with "the first 1,000 words," no
time claims, no gamification language.

**App name:** PocketPolyglot

**Subtitle** (≤30 chars): `The first 1,000 Latvian words` (29 chars)

**Description:**

> PocketPolyglot teaches you the first 1,000 most common Latvian words — the vocabulary that
> covers roughly 80% of everyday conversation. Each word and phrase is practiced three ways:
> hear it, choose it, and say it, so recognition and production build together instead of one
> lagging behind the other.
>
> Progress is measured honestly, as coverage of everyday Latvian speech you can actually
> follow. You always know exactly what portion of daily conversation is within your reach, and
> nothing is dressed up to feel bigger than it is.
>
> When you're ready, record yourself and compare your pronunciation against a native speaker,
> word by word or phrase by phrase — entirely optional, and only ever with your explicit
> in-app consent. You can revoke that consent, delete your recordings, or delete your account
> at any time from Settings.

**Keywords:** `latvian,latvia,language,learn latvian,vocabulary,pronunciation,flashcards,srs`

**Support URL:** `https://gabrial1997.github.io/PocketPolyglot/` (value of `SUPPORT_URL` in
`src/config/support.ts`)

**Privacy Policy URL:** `https://gabrial1997.github.io/PocketPolyglot/privacy.html` (value of
`PRIVACY_URL` in `src/config/support.ts`)

**Age rating:** 4+

**Category:** Education

**App Privacy (nutrition labels)** — declare:
- **Contact Info:** Email Address (linked to the user's account)
- **User Content:** Audio Data (voice recordings, collected only with explicit in-app consent,
  linked to the user, **not** used for tracking)
- **Identifiers:** User ID
- **Usage Data:** none collected
- No third-party tracking. No advertising.

**Review notes** (paste into the App Review notes field):

> Test account credentials will be supplied separately at submission time.
>
> Recording/pronunciation-compare features require the user to explicitly opt in via an
> in-app consent screen on first launch (Settings → Profile → Security also lets a user
> revoke consent and delete recordings at any time) — no audio is recorded before consent is
> given.
>
> The Listen tab is intentionally locked below 25% vocabulary coverage by design (this is not
> a bug) — please use the seeded reviewer account provided at submission time, which is
> already at ≥25% coverage, to access it.

## 6. Submit for review (YOU)

```bash
eas submit -p ios
```

- Export compliance: already declared in `app.config.ts`
  (`ITSAppUsesNonExemptEncryption: false`) — accept the pre-filled answer if prompted again in
  App Store Connect.
- Paste in the metadata from step 5 (App Store Connect → App Information / Pricing /
  App Privacy / Version Release Notes) if not already carried over from a prior TestFlight
  submission.
- Submit for review.

## 7. After approval

- [ ] Release the version — manually or via App Store Connect's automatic-release setting,
      whichever you configured at submission.
- [ ] Tag the release in git:
      ```bash
      git tag v1.0.0
      git push origin v1.0.0
      ```

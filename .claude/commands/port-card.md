---
description: Port a given CardKind from the prototype into Expo / React Native, honoring the boundary.
argument-hint: <CardKind> (e.g. word/pic-review, phrase/hear, drill, pron)
---

Port the card **$ARGUMENTS** from the design prototype into the production Expo / React Native
app, using the `frontend-card-porter` approach and honoring the data-in / events-out boundary.

Steps:

1. Find the row for `$ARGUMENTS` in `docs/WIRING_MAP.md` §1 — note its component function, file,
   trigger prop, and the **hard-coded sample data to delete**.
2. Read that card's contract in `docs/BACKEND_INTEGRATION.md` §4.
3. Read the prototype source file named in the wiring-map row to preserve the UI state machine.
4. Implement the RN card:
   - keep the local state machine identical;
   - render from `item` fields; delete the hard-coded constants;
   - take callbacks as props; do NOT import any service in the card;
   - use the theme context + ported primitives, no raw color/spacing literals;
   - keep the `CardKind` `id`+`k` strings stable.
5. Write a test that renders the card from a fixture `ReviewItem` and asserts the emitted
   `CardResult` on its main path.
6. Run `/run-ci` and make sure lint, typecheck, test, and build all pass before reporting done.

If `$ARGUMENTS` is a Tier-B screen (`home`, `pod`, `prog`): wire it with its own service per
`docs/WIRING_MAP.md` §3 — it does NOT take `ReviewItem` or emit `CardResult`.

Stop after this one card. Do not batch others.

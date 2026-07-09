# Kickoff prompt — release-readiness execution (paste into a fresh session)

Execute the implementation plan at
`pocketpolyglot-app/docs/superpowers/plans/2026-07-09-release-readiness.md` using the
**superpowers:subagent-driven-development** skill: you are the orchestrator — fresh implementer
subagent per task, task review (spec + quality) after each, broad whole-branch review at the end.
Do not implement tasks yourself.

Context you need before Task 1:

- App repo: `~/workspace/pocketpolyglot/pocketpolyglot-app`, base = `main` @ `f2cd694`. Create
  branch `feat/release-readiness`. The binding spec is
  `docs/superpowers/specs/2026-07-09-release-readiness-design.md`; the plan's Global Constraints
  section applies to every task.
- Track your progress in `.superpowers/sdd/progress.md` (append a new section; earlier sections
  are from finished efforts).
- Supabase project `necfghfotwykjsykccsa`. Per the plan's execution notes: apply merged
  migrations 0016 + 0017 live at start, and 0018 after Task 3 passes review — founder approval
  is carried by the spec; if a permission prompt appears, surface it, don't skip.
- Task 10 (content text audit) is controller-orchestrated fan-out work in the WORKSPACE ROOT
  repo (`~/workspace/pocketpolyglot`, a separate git repo: `words/` CSVs) + the live DB. Run it
  in parallel with Tasks 1–9. Follow its adversarial-verify protocol exactly — no fix lands
  without independent confirmation.
- `GITHUB_API_TOKEN` lives in `~/workspace/pocketpolyglot/.env` (gh's stored credential is
  expired — export `GH_TOKEN` from the .env value for any `gh` call, e.g. Task 9's Pages setup).
- The support email is unresolved (GitHub issue #5) — use the placeholder exactly as the plan
  specifies; never invent a real-looking address.
- Suggested order: 1, 2, 3, 4, 5, 6, 7, 9, 8, 11, with 10 alongside from the start. Task 11's
  merge to main goes through a PR with CI green.
- Founder-owned and OUT of scope: running `eas build`/`eas submit`, the on-device checklist run,
  all audio recording/generation, podcast episode content.

When done: hand the founder the PR link, `docs/RELEASE_RUNBOOK.md`,
`docs/RELEASE_ONDEVICE_CHECKLIST.md`, `words/ELIZABETE_REVIEW.md`, and the two live GitHub Pages
URLs.

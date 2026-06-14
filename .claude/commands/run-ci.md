---
description: Run the CI pipeline locally — lint, typecheck, test, build — and report each result.
---

Run the same checks the CI pipeline runs, in this order, and report PASS/FAIL for each:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Rules:

- Run them in order. If `lint` or `typecheck` fails, fix the reported issues, then re-run from
  the top.
- The pipeline is green only when **all four** pass. Report a clear per-step summary.
- These four scripts mirror `.github/workflows/ci.yml` exactly — local green should mean CI green.
- Do not mark work done until this is fully green. A passing pipeline is the gate for every
  change (see `KICKOFF_PROMPT.md` STEP 0 and `CONTRIBUTING.md`).

# Docs Index

The coding docs for PocketPolyglot. Read in this order when wiring up the app.

| Doc | What it is | Read it for |
|---|---|---|
| `DESIGN_HANDOFF.md` | The design handoff README — screens, the core loop, **design tokens**, assets, card registry. | Look/feel, the token values to port first, what each screen does. |
| `BACKEND_INTEGRATION.md` | The component boundary: the `ReviewItem` / `CardResult` shapes, `SessionController` + `renderFor()`, per-card contracts, services to inject. | **The data-in / events-out contract.** Read before touching any card. |
| `WIRING_MAP.md` | The one-to-one map: every `CardKind` ↔ component ↔ file ↔ trigger prop ↔ sample data to delete, the routing gotchas, RN port notes, and the recommended wiring order (§6). | Mechanical porting — find the file, the prop, what to delete. |
| `database-schema-seed.md` | Supabase / Postgres schema **suggestions** (content vs. user-state tiers, FSRS state, dynamic distractors, RLS/GDPR, ML-service boundary, seeding pipeline). | Backend / migration work. Adapt it — it is a seed, not a contract. |
| `latvian-case-frequency-morphology.md` | Evidence memo behind the 4-case morphology cutoff (nom/acc/dat/loc explicit, genitive incidental). | Why the cutoff is what it is; what's pending before it locks. |

See also, one level up: `CLAUDE.md` (codebase memory), `DECISIONS.md` (locked decisions),
`CONTRIBUTING.md` (conventions), `KICKOFF_PROMPT.md` (build order).

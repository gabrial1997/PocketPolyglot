// Canonical pacing/maturity constants for the core loop. EVERY number the scheduler
// (Module B) and maturity ladder (Module C) use is a named constant here — no inline
// literals anywhere in the loop. Tune values here; the loop reads them by name.
// Defaults + ranges from the design spec §10.1 (locked decisions §2).

/** One-time first-day onboarding bolus: up to 20 new items on day 1. */
export const DAY_ONE_NEW_CAP = 20 as const;
/** Every day after day 1: fixed 5 new. No upward ramp, no unlockable ceiling. */
export const STEADY_STATE_NEW_CAP = 5 as const;
/** Reviews/day target; used ONLY by the due-flood gate (reviews themselves are uncapped). */
export const REVIEW_BUDGET = 70 as const;
/** dueToday > DUE_FLOOD_MULTIPLIER × REVIEW_BUDGET -> newCap = 0. */
export const DUE_FLOOD_MULTIPLIER = 2 as const;
/** Rolling retention below this -> halve newCap (throttle down, never pause fully). */
export const RETENTION_GATE_THRESHOLD = 0.85 as const;
/** Window of last-N graded mature reviews for the rolling-retention calc. */
export const RETENTION_WINDOW = 50 as const;
/** receptiveReps >= this -> rung recognition→recall. */
export const RECEPTIVE_GRADUATION_FLOOR = 3 as const;
/** productiveReps >= this -> eligible for the production sub-track. */
export const PRODUCTION_GRADUATION_FLOOR = 6 as const;
/** Max unknown phrase components for a phrase to be i+1-admissible. */
export const I_PLUS_ONE_UNKNOWN_TOLERANCE = 1 as const;

// Podcast unlock gate (spec 2026-07-09 §1). One named threshold, one pure predicate — the host
// and any future surface (Home teaser, notifications) must share THIS math, never re-derive it.
import type { ProgressCoverage } from '../services';

/** Coverage ratio at which the Listen tab unlocks. Boundary: >= unlocks (250/1000 ⇒ open). */
export const PODCAST_UNLOCK_COVERAGE = 0.25;

/** True while the learner's coverage is below the unlock threshold. Empty corpus ⇒ locked. */
export function podcastLocked(cov: ProgressCoverage): boolean {
  if (cov.total <= 0) return true;
  return cov.knownRanks.length / cov.total < PODCAST_UNLOCK_COVERAGE;
}

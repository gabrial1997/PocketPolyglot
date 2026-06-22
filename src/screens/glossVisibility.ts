/**
 * shouldShowGloss — pure helper that maps translationVisibility mode + transient reveal state
 * to a boolean. Cards call this to decide whether to render the gloss (English meaning).
 *
 * Pure: no side-effects, no imports, no theme. Cards own the `missed` + `tappedReveal` state.
 *
 * Modes (from ReviewItem.translationVisibility, derived by computeRung in Module C2):
 *   'auto'      — recognition scaffolding; gloss is always visible.
 *   'hint'      — recall; gloss is hidden until the learner misses (wrong pick / Again).
 *   'on-demand' — production; gloss is hidden until the learner explicitly taps "Show meaning".
 */
export function shouldShowGloss(
  mode: 'auto' | 'hint' | 'on-demand',
  missed: boolean,
  tappedReveal: boolean,
): boolean {
  if (mode === 'auto') return true;
  if (mode === 'hint') return missed;
  // on-demand
  return tappedReveal;
}

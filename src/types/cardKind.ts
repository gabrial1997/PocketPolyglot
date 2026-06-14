// CardKind union — the stable analytics / deep-link keys (WIRING_MAP §1, BACKEND_INTEGRATION §2).
// These map 1:1 to app.jsx PP_SCREENS `id` + variant `k`. Keep them stable.
//
// NOTE: `phrase/locked` and `phrase/unlock` are gating UI driven by the controller's
// known-word check (BACKEND_INTEGRATION §4). The contract's renderFor() union in §2 lists only
// the review-loop kinds; we include locked/unlock here because they ARE real card screens in
// the registry (WIRING_MAP §1), but renderFor() never returns them — the controller decides
// lock state separately.

/** Card kinds returned by renderFor() — the SRS review loop (BACKEND_INTEGRATION §2). */
export type ReviewCardKind =
  | 'word/learn-concrete'
  | 'word/learn-abstract'
  | 'word/learn-function'
  | 'word/pic-review'
  | 'word/hear'
  | 'word/say'
  | 'phrase/hear'
  | 'phrase/meaning'
  | 'phrase/sayit'
  | 'drill'
  | 'pron';

/** Phrase gating screens — controller-driven, not from renderFor() (WIRING_MAP §1). */
export type PhraseGateKind = 'phrase/locked' | 'phrase/unlock';

/** Every wireable card screen (Tier A). */
export type CardKind = ReviewCardKind | PhraseGateKind;

/** Tier-B standalone screens — NOT cards, not in the review loop (WIRING_MAP §3). */
export type StandaloneScreen = 'home' | 'pod' | 'prog';

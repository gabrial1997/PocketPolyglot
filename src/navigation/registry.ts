// Card registry — keyed by the stable CardKind strings (= app.jsx PP_SCREENS id+`k`).
// These keys ARE the analytics events and deep-link routes (WIRING_MAP §1/§6). Keep them stable.
// The SessionController calls renderFor(item) -> CardKind, then mounts CARD_REGISTRY[kind].
import type React from 'react';
import type { CardKind } from '../types/cardKind';
import {
  WordLearnConcrete,
  WordLearnAbstract,
  WordLearnFunction,
  WordPicReview,
  WordHear,
  WordSay,
  PhraseLocked,
  PhraseUnlock,
  PhraseHear,
  PhraseMeaning,
  PhraseSayIt,
  DrillScreen,
  DiphthongDrillScreen,
  PronounceScreen,
} from '../screens';

// Card components have varying prop shapes; the controller supplies the right callbacks per kind.
// We register them loosely-typed at the registry boundary and the controller narrows per kind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCard = React.ComponentType<any>;

export const CARD_REGISTRY: Record<CardKind, AnyCard> = {
  'word/learn-concrete': WordLearnConcrete,
  'word/learn-abstract': WordLearnAbstract,
  'word/learn-function': WordLearnFunction,
  'word/pic-review': WordPicReview,
  'word/hear': WordHear,
  'word/say': WordSay,
  // word/recall (spec 2026-07-23 §4): renderFor() never returns this key — a probe item always
  // renders as 'word/hear' — but CARD_REGISTRY must stay exhaustive over CardKind. Same screen
  // as the kind it stands in for, kept purely so the registry type-checks.
  'word/recall': WordHear,
  'phrase/locked': PhraseLocked,
  'phrase/unlock': PhraseUnlock,
  'phrase/hear': PhraseHear,
  'phrase/meaning': PhraseMeaning,
  'phrase/sayit': PhraseSayIt,
  drill: DrillScreen,
  diphthong: DiphthongDrillScreen,
  pron: PronounceScreen,
};

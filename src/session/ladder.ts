import {
  RECEPTIVE_GRADUATION_FLOOR,
  PRODUCTION_GRADUATION_FLOOR,
} from './pacing';

export type Rung = 'recognition' | 'recall' | 'production';

/** Pure: derive the ladder rung from the two retrieval counts.
 *  recognition (default) → recall once receptiveReps >= RECEPTIVE_GRADUATION_FLOOR
 *  → production once productiveReps >= PRODUCTION_GRADUATION_FLOOR.
 *  Production is a sub-track: it depends ONLY on productiveReps, never on receptiveReps. */
export function computeRung(receptiveReps: number, productiveReps: number): Rung {
  if (productiveReps >= PRODUCTION_GRADUATION_FLOOR) {
    return 'production';
  }
  if (receptiveReps >= RECEPTIVE_GRADUATION_FLOOR) {
    return 'recall';
  }
  return 'recognition';
}

/** Pure: map a rung to its translation-visibility mode. */
export function translationVisibilityForRung(rung: Rung): 'auto' | 'hint' | 'on-demand' {
  switch (rung) {
    case 'recognition':
      return 'auto';
    case 'recall':
      return 'hint';
    case 'production':
      return 'on-demand';
  }
}

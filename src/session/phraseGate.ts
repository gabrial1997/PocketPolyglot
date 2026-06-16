// Pure i+1 phrase-gate logic. A phrase is AVAILABLE when at most one of its component lemmas is
// unknown (the single unknown is the "+1" new word); LOCKED when 2+ are unknown. The controller
// turns a locked→available transition into the one-time 'phrase/unlock' reveal (see sessionController).
export interface LockState {
  locked: boolean;
  unknownCount: number;
}

export function lockState(componentLemmaIds: string[], known: Set<string>): LockState {
  const unknownCount = componentLemmaIds.filter((id) => !known.has(id)).length;
  return { locked: unknownCount > 1, unknownCount };
}

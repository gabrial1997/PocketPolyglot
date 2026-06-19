// Pure phrase-gate logic. A phrase is AVAILABLE only when ALL its component lemmas are known
// ("Unlocks when its words are known" — the mockup). LOCKED while any component is still unknown.
// The controller turns a locked→available transition into the one-time 'phrase/unlock' reveal.
export interface LockState {
  locked: boolean;
  unknownCount: number;
}

export function lockState(componentLemmaIds: string[], known: ReadonlySet<string>): LockState {
  const unknownCount = componentLemmaIds.filter((id) => !known.has(id)).length;
  return { locked: unknownCount > 0, unknownCount };
}

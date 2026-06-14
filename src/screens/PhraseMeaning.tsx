// phrase/meaning — multiple-choice meaning check, idioms only (BACKEND_INTEGRATION §4).
// Out: { correct }.
import React from 'react';
import { PlayOrb, ChoiceButton } from '../components';
import { CardShell } from './CardShell';
import type { ChoiceCardProps } from './cardProps';

export function PhraseMeaning({
  item,
  onPlay,
  onAnswer,
  onComplete,
}: ChoiceCardProps): React.JSX.Element {
  return (
    <CardShell eyebrow="What does it mean?" target={item.target}>
      <PlayOrb onPress={() => onPlay('native')} />
      {(item.choices ?? []).map((c) => (
        <ChoiceButton
          key={c.value}
          label={c.gloss ?? c.value}
          onPress={() => {
            onAnswer(c.value, c.correct);
            onComplete({ itemId: item.id, cardKind: 'phrase/meaning', correct: c.correct });
          }}
        />
      ))}
    </CardShell>
  );
}

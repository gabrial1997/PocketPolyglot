// word/hear — recognition review (BACKEND_INTEGRATION §4). Audio is the cue; choices are GLOSSES.
// Out: { correct, spoke:false }. No recording stage.
import React from 'react';
import { PlayOrb, ChoiceButton, SpeedChip } from '../components';
import { CardShell } from './CardShell';
import type { ChoiceCardProps } from './cardProps';

export function WordHear({
  item,
  onPlay,
  onAnswer,
  onComplete,
  speed,
  onSpeedChange,
}: ChoiceCardProps): React.JSX.Element {
  return (
    <CardShell eyebrow="Listen — which meaning?">
      <PlayOrb onPress={() => onPlay('native')} />
      <SpeedChip value={speed} onChange={onSpeedChange} />
      {(item.choices ?? []).map((c) => (
        <ChoiceButton
          key={c.value}
          label={c.gloss ?? c.value}
          onPress={() => {
            onAnswer(c.value, c.correct);
            onComplete({ itemId: item.id, cardKind: 'word/hear', correct: c.correct, spoke: false });
          }}
        />
      ))}
    </CardShell>
  );
}

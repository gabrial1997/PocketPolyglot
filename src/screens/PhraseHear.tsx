// phrase/hear — first exposure: hear the phrase, reveal meaning (BACKEND_INTEGRATION §4).
// Out: { spoke:false }.
import React from 'react';
import { PlayOrb, CtaButton, SpeedChip } from '../components';
import { CardShell } from './CardShell';
import type { BaseCardProps } from './cardProps';

export function PhraseHear({
  item,
  onPlay,
  onComplete,
  speed,
  onSpeedChange,
}: BaseCardProps): React.JSX.Element {
  return (
    <CardShell eyebrow="New phrase" target={item.target} gloss={item.gloss}>
      <PlayOrb onPress={() => onPlay('native')} />
      <SpeedChip value={speed} onChange={onSpeedChange} />
      <CtaButton
        title="Continue"
        onPress={() => onComplete({ itemId: item.id, cardKind: 'phrase/hear', spoke: false })}
      />
    </CardShell>
  );
}

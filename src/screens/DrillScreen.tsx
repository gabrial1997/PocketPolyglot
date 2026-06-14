// drill — minimal-pair perception drill (BACKEND_INTEGRATION §4, README 04).
// In: item.pair { a, b, correct, audioUrl }. Pick a|b -> say-it-back (idle -> rec -> done).
// Out: { correct, spoke:true, recording }.
import React, { useState } from 'react';
import { PlayOrb, ChoiceButton, MicOrb, CtaButton } from '../components';
import { CardShell } from './CardShell';
import type { RecordingCardProps } from './cardProps';

type Say = 'idle' | 'rec' | 'done';

export function DrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onComplete } = props;
  const [picked, setPicked] = useState<'a' | 'b' | null>(null);
  const [say, setSay] = useState<Say>('idle');
  const pair = item.pair;

  if (!pair) return <CardShell eyebrow="Drill" />;
  const correct = picked === pair.correct;

  return (
    <CardShell eyebrow="Which sound?">
      <PlayOrb onPress={() => onPlay('native')} />
      {picked === null ? (
        <>
          <ChoiceButton label={pair.a} onPress={() => setPicked('a')} />
          <ChoiceButton label={pair.b} onPress={() => setPicked('b')} />
        </>
      ) : null}

      {picked !== null && say === 'idle' ? (
        <MicOrb onPress={() => { onRecordStart(); setSay('rec'); }} />
      ) : null}
      {say === 'rec' ? (
        <MicOrb rec onPress={() => { onRecordStop('stub://recording'); setSay('done'); }} />
      ) : null}
      {say === 'done' ? (
        <CtaButton
          title="Continue"
          onPress={() => onComplete({ itemId: item.id, cardKind: 'drill', correct, spoke: true })}
        />
      ) : null}
    </CardShell>
  );
}

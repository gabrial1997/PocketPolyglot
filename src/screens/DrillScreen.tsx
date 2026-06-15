// drill — minimal-pair perception drill (BACKEND_INTEGRATION §4, README 04).
// In: item.pair { a, b, correct, audioUrl }. Pick a|b -> say-it-back (idle -> rec -> done).
// Out: { correct, spoke:true, recording }.
import React, { useState } from 'react';
import { PlayOrb, ChoiceButton, MicOrb, CtaButton, TryAgainNote } from '../components';
import { CardShell } from './CardShell';
import type { RecordingCardProps } from './cardProps';

type Say = 'idle' | 'rec' | 'done';

export function DrillScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onComplete } = props;
  // A wrong pick does NOT advance (APP_HANDOFF.md): `committed` is only set by the CORRECT side and
  // is what unlocks the say-it step; `wrongPick` reddens only the chosen wrong side; `missed` keeps
  // honest first-try correctness for the SRS interval. The correct side is never revealed.
  const [committed, setCommitted] = useState<'a' | 'b' | null>(null);
  const [wrongPick, setWrongPick] = useState<'a' | 'b' | null>(null);
  const [missed, setMissed] = useState(false);
  const [say, setSay] = useState<Say>('idle');
  const pair = item.pair;

  if (!pair) return <CardShell eyebrow="Drill" />;

  const choose = (side: 'a' | 'b') => {
    if (side === pair.correct) setCommitted(side); // correct: advance to say-it
    else {
      setWrongPick(side);
      setMissed(true); // wrong: stay, redden only this side, never advance
    }
  };

  return (
    <CardShell eyebrow="Which sound?">
      <PlayOrb onPress={() => onPlay('native')} />
      {committed === null ? (
        <>
          <ChoiceButton label={pair.a} state={wrongPick === 'a' ? 'wrong' : 'idle'} onPress={() => choose('a')} />
          <ChoiceButton label={pair.b} state={wrongPick === 'b' ? 'wrong' : 'idle'} onPress={() => choose('b')} />
          {wrongPick ? <TryAgainNote onRetry={() => setWrongPick(null)} /> : null}
        </>
      ) : null}

      {committed !== null && say === 'idle' ? (
        <MicOrb onPress={() => { onRecordStart(); setSay('rec'); }} />
      ) : null}
      {say === 'rec' ? (
        <MicOrb rec onPress={() => { onRecordStop(); setSay('done'); }} />
      ) : null}
      {say === 'done' ? (
        <CtaButton
          title="Continue"
          onPress={() => onComplete({ itemId: item.id, cardKind: 'drill', correct: !missed, spoke: true })}
        />
      ) : null}
    </CardShell>
  );
}

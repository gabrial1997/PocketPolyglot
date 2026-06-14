// phrase/sayit — mature review: cue -> record -> compare -> self-rate (good/again).
// (Canonical kind 'phrase/sayit'; 'review' is a legacy alias — WIRING_MAP §2.)
// Out: { spoke:true, recording, selfRating }.
import React, { useState } from 'react';
import { View } from 'react-native';
import { PlayOrb, MicOrb, CtaButton, Waveform } from '../components';
import { CardShell } from './CardShell';
import type { RecordingCardProps } from './cardProps';

type Stage = 'cue' | 'rec' | 'compare';

export function PhraseSayIt(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onComplete } = props;
  const [stage, setStage] = useState<Stage>('cue');

  function rate(selfRating: 'good' | 'again'): void {
    onComplete({ itemId: item.id, cardKind: 'phrase/sayit', spoke: true, selfRating });
  }

  return (
    <CardShell eyebrow="Say the phrase" gloss={item.gloss}>
      {stage === 'cue' ? (
        <>
          <PlayOrb onPress={() => onPlay('native')} />
          <MicOrb onPress={() => { onRecordStart(); setStage('rec'); }} />
        </>
      ) : null}
      {stage === 'rec' ? (
        <MicOrb rec onPress={() => { onRecordStop('stub://recording'); setStage('compare'); }} />
      ) : null}
      {stage === 'compare' ? (
        <View style={{ rowGap: 12 }}>
          <Waveform seed={`${item.id}-native`} played={1} />
          <Waveform seed={`${item.id}-you`} played={1} />
          <CtaButton title="Good" onPress={() => rate('good')} />
          <CtaButton title="Again" variant="outline" onPress={() => rate('again')} />
        </View>
      ) : null}
    </CardShell>
  );
}

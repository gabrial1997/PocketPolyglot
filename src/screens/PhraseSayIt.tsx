// phrase/sayit — productive recall: English cue -> record -> compare -> self-rate (good/again).
// No pre-hear: the learner produces the Latvian from memory (see==hear exception — translation
// recall). Native audio appears only in the compare stage. (Canonical kind 'phrase/sayit'.)
// Out: { spoke:true, recording, selfRating }.
import React, { useState } from 'react';
import { View } from 'react-native';
import { MicOrb, CtaButton, Waveform } from '../components';
import { CardShell } from './CardShell';
import type { RecordingCardProps } from './cardProps';

type Stage = 'cue' | 'rec' | 'compare';

export function PhraseSayIt(props: RecordingCardProps): React.JSX.Element {
  const { item, onRecordStart, onRecordStop, onPlayCompare, onComplete } = props;
  const [stage, setStage] = useState<Stage>('cue');

  function rate(selfRating: 'good' | 'again'): void {
    onComplete({ itemId: item.id, cardKind: 'phrase/sayit', spoke: true, selfRating });
  }

  return (
    <CardShell eyebrow="Say the phrase" gloss={item.gloss}>
      {stage === 'cue' ? (
        <MicOrb onPress={() => { onRecordStart(); setStage('rec'); }} />
      ) : null}
      {stage === 'rec' ? (
        <MicOrb rec onPress={() => { onRecordStop(); setStage('compare'); }} />
      ) : null}
      {stage === 'compare' ? (
        <View style={{ rowGap: 12, alignSelf: 'stretch' }}>
          <Waveform seed={`${item.id}-native`} played={1} envelope={item.audio.envelope} />
          <Waveform seed={`${item.id}-you`} played={1} />
          <CtaButton title="Play original" variant="outline" onPress={() => onPlayCompare?.('native')} />
          <CtaButton title="Play yours" variant="outline" onPress={() => onPlayCompare?.('you')} />
          <CtaButton title="Good" onPress={() => rate('good')} />
          <CtaButton title="Again" variant="outline" onPress={() => rate('again')} />
        </View>
      ) : null}
    </CardShell>
  );
}

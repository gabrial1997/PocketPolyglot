// pron — pronunciation comparison (BACKEND_INTEGRATION §4, README 05).
// Play native model -> record -> compare waveforms (real scoring is backend ML, §7).
// Out: { spoke:true, recording }.
import React, { useState } from 'react';
import { View } from 'react-native';
import { PlayOrb, MicOrb, CtaButton, Waveform } from '../components';
import { CardShell } from './CardShell';
import type { RecordingCardProps } from './cardProps';

type Stage = 'listen' | 'rec' | 'compare';

export function PronounceScreen(props: RecordingCardProps): React.JSX.Element {
  const { item, onPlay, onRecordStart, onRecordStop, onPlayCompare, onComplete } = props;
  const [stage, setStage] = useState<Stage>('listen');

  return (
    <CardShell eyebrow="Pronounce" target={item.target} pron={item.pron}>
      {stage === 'listen' ? (
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
          <CtaButton title="Play back-to-back" variant="outline" onPress={() => onPlayCompare?.('native')} />
          <CtaButton
            title="Continue"
            onPress={() => onComplete({ itemId: item.id, cardKind: 'pron', spoke: true })}
          />
        </View>
      ) : null}
    </CardShell>
  );
}

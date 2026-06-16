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
        <MicOrb rec onPress={() => { onRecordStop(); setStage('compare'); }} />
      ) : null}
      {stage === 'compare' ? (
        <View style={{ rowGap: 12 }}>
          <Waveform seed={`${item.id}-native`} played={1} envelope={item.audio.envelope} />
          <Waveform seed={`${item.id}-you`} played={1} />
          {/* A/B self-compare (a locked product pillar): replay the native model and your take. */}
          <CtaButton title="Play original" variant="outline" onPress={() => onPlayCompare?.('native')} />
          <CtaButton title="Play yours" variant="outline" onPress={() => onPlayCompare?.('you')} />
          <CtaButton
            title="Continue"
            onPress={() => onComplete({ itemId: item.id, cardKind: 'pron', spoke: true })}
          />
        </View>
      ) : null}
    </CardShell>
  );
}

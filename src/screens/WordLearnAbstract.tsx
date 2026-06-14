// word/learn-abstract — abstract-word first-exposure card with sound-alike mnemonic.
// In: item (target, gloss, audio, mnemonic { soundsLike, note }). Out: onComplete({ spoke:false }).
import React from 'react';
import { Text } from 'react-native';
import { PlayOrb, CtaButton } from '../components';
import { CardShell } from './CardShell';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';
import type { BaseCardProps } from './cardProps';

export function WordLearnAbstract({ item, onPlay, onComplete }: BaseCardProps): React.JSX.Element {
  const T = useTheme();
  return (
    <CardShell eyebrow="New word" target={item.target} gloss={item.gloss} pron={item.pron}>
      {item.mnemonic ? (
        <Text style={{ color: T.sub, fontSize: type.body }}>
          Sounds like “{item.mnemonic.soundsLike}” — {item.mnemonic.note}
        </Text>
      ) : null}
      <PlayOrb onPress={() => onPlay('native')} />
      <CtaButton
        title="First review tomorrow"
        onPress={() => onComplete({ itemId: item.id, cardKind: 'word/learn-abstract', spoke: false })}
      />
    </CardShell>
  );
}

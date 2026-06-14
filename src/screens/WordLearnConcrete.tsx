// word/learn-concrete — picturable-noun first-exposure card (WIRING_MAP §1, BACKEND_INTEGRATION §4).
// In: item (target, gloss, pron, audio, media.imageUrl[/Dark]). Image swaps to imageUrlDark in dark.
// Out: onComplete({ spoke:false }) — exposure only; backend schedules first review.
import React from 'react';
import { PlayOrb, CtaButton } from '../components';
import { CardShell } from './CardShell';
import { useTheme } from '../theme/ThemeProvider';
import type { BaseCardProps } from './cardProps';

export function WordLearnConcrete({
  item,
  onPlay,
  onComplete,
}: BaseCardProps): React.JSX.Element {
  const T = useTheme();
  // image = T.dark ? item.media?.imageUrlDark : item.media?.imageUrl  (wire when assets land)
  void T;
  return (
    <CardShell eyebrow="New word" target={item.target} gloss={item.gloss} pron={item.pron}>
      <PlayOrb onPress={() => onPlay('native')} />
      <CtaButton
        title="First review tomorrow"
        onPress={() => onComplete({ itemId: item.id, cardKind: 'word/learn-concrete', spoke: false })}
      />
    </CardShell>
  );
}

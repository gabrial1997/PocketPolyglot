// phrase/unlock — one restrained reveal + soft chime, then auto-advances (BACKEND_INTEGRATION §4).
// The unlock chime is routed through AudioService by the controller (BACKEND_INTEGRATION §7) —
// the card only fires onUnlocked(); it does NOT call an audio context directly.
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { CardShell } from './CardShell';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';
import type { PhraseGateProps } from './cardProps';

export function PhraseUnlock({ item, onUnlocked }: PhraseGateProps): React.JSX.Element {
  const T = useTheme();
  useEffect(() => {
    // controller plays the unlock chime via AudioService, then auto-advances after a readable delay.
    // onUnlocked returns a canceller — run it on unmount so a late advance never fires after the
    // card is gone (no state-update-after-unmount warning).
    return onUnlocked?.();
  }, [onUnlocked]);
  return (
    <CardShell eyebrow="Unlocked" target={item.target} gloss={item.gloss}>
      <Text style={{ color: T.good, fontSize: type.body }}>New phrase unlocked</Text>
    </CardShell>
  );
}

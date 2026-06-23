// ConsentScreen — GDPR recording consent (Module D3b).
// Pure presentational: data-in / events-out. No service import, no fetch.
// Required GDPR disclosures:
//   (a) recordings are KEPT OVER TIME to track pronunciation progress (longitudinal retention)
//   (b) a human language coach may LISTEN to recordings to help improve the app (rater access)
// Separate OFF-by-default training opt-in toggle.
// NOT a card; NOT in CARD_REGISTRY or renderFor.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Screen, CtaButton } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { SettSwitch } from '../components/SettingsPrimitives';
import { fonts, type, radii } from '../theme/tokens';

export interface ConsentScreenProps {
  /** Called when the user accepts recording consent. `training` is the optional model-training opt-in. */
  onAccept: (input: { training: boolean }) => void;
  /** Called when the user declines recording — app continues without any record affordance. */
  onDecline: () => void;
}

export function ConsentScreen({ onAccept, onDecline }: ConsentScreenProps): React.JSX.Element {
  const T = useTheme();
  const [training, setTraining] = useState(false);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading */}
        <Text style={[styles.heading, { color: T.ink, fontFamily: fonts.headline }]}>
          Recording your speech
        </Text>

        {/* Primary disclosure copy */}
        <Text style={[styles.body, { color: T.sub }]}>
          To help you improve, the app can record your attempts as you practise speaking. Here
          is what that means for your data:
        </Text>

        {/* Disclosure (a): longitudinal retention */}
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.hair }]}>
          <View style={styles.disclosureRow}>
            <Text style={[styles.disclosureLabel, { color: T.ink }]}>Your recordings are kept over time</Text>
            <Text style={[styles.disclosureBody, { color: T.sub }]}>
              Your pronunciation recordings are stored and kept over time so the app can
              track your progress and show you how your speech has developed.
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: T.hair }]} />

          {/* Disclosure (b): rater / human coach access */}
          <View style={styles.disclosureRow}>
            <Text style={[styles.disclosureLabel, { color: T.ink }]}>A human reviewer may listen</Text>
            <Text style={[styles.disclosureBody, { color: T.sub }]}>
              A human language coach or reviewer may listen to a sample of your recordings to
              help improve the app and its feedback. Recordings are never shared publicly.
            </Text>
          </View>
        </View>

        {/* Optional training opt-in */}
        <View style={[styles.toggleCard, { backgroundColor: T.surface, borderColor: T.hair }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={[styles.toggleLabel, { color: T.ink }]}>
                Help train pronunciation models
              </Text>
              <Text style={[styles.toggleSub, { color: T.sub }]}>
                Also allow my recordings to help train pronunciation models. Off by default.
              </Text>
            </View>
            <SettSwitch
              on={training}
              onToggle={() => setTraining((v) => !v)}
              accessibilityLabel="Allow training data use"
            />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <CtaButton title="Allow recording" onPress={() => onAccept({ training })} />
          <View style={styles.declineWrap}>
            <CtaButton title="Not now" variant="outline" onPress={onDecline} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  heading: {
    fontSize: 34,
    letterSpacing: -0.2,
    lineHeight: 40,
    marginTop: 12,
    marginBottom: 14,
  },
  body: {
    fontSize: type.body,
    lineHeight: 24,
    marginBottom: 20,
  },
  card: {
    borderRadius: radii.surface,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 16,
  },
  disclosureRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    rowGap: 6,
  },
  disclosureLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  disclosureBody: {
    fontSize: type.label,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
  toggleCard: {
    borderRadius: radii.surface,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 28,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    columnGap: 14,
  },
  toggleText: {
    flex: 1,
    rowGap: 4,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleSub: {
    fontSize: type.label,
    lineHeight: 18,
  },
  actions: {
    rowGap: 12,
  },
  declineWrap: {
    marginTop: 2,
  },
});

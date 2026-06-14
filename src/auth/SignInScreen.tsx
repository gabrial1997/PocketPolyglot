// SignInScreen — calm two-step email-OTP sign-in (Tier B standalone screen).
// Step 1: enter email -> send code. Step 2: enter the 6-digit code -> verify.
// Pure UI over useAuth(); matches HomeScreen's restrained styling (no gamification).
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Screen, CtaButton } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { type, fonts, radii, sizing } from '../theme/tokens';
import { useAuth } from './AuthProvider';

type Step = 'email' | 'code';

export function SignInScreen(): React.JSX.Element {
  const T = useTheme();
  const { signInWithOtp, verifyOtp } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSendCode(): Promise<void> {
    setSubmitting(true);
    setError(null);
    const { error: err } = await signInWithOtp(email.trim());
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    setStep('code');
  }

  async function onVerify(): Promise<void> {
    setSubmitting(true);
    setError(null);
    const { error: err } = await verifyOtp(email.trim(), code.trim());
    setSubmitting(false);
    if (err) setError(err);
  }

  function onUseDifferentEmail(): void {
    setStep('email');
    setCode('');
    setError(null);
  }

  const isEmailStep = step === 'email';

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.title, { color: T.ink, fontFamily: fonts.headline }]}>
          {isEmailStep ? 'Sign in' : 'Enter code'}
        </Text>
        <Text style={[styles.subtitle, { color: T.sub }]}>
          {isEmailStep
            ? 'We will email you a one-time code.'
            : `We sent a 6-digit code to ${email.trim()}.`}
        </Text>

        {isEmailStep ? (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={T.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!submitting}
            style={[styles.input, { color: T.ink, borderColor: T.hair, backgroundColor: T.surface }]}
          />
        ) : (
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={T.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            editable={!submitting}
            style={[styles.input, { color: T.ink, borderColor: T.hair, backgroundColor: T.surface }]}
          />
        )}

        {error ? <Text style={[styles.error, { color: T.record }]}>{error}</Text> : null}

        {!isEmailStep ? (
          <Pressable onPress={onUseDifferentEmail} disabled={submitting} hitSlop={8}>
            <Text style={[styles.altAction, { color: T.primary }]}>Use a different email</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.footer}>
        <CtaButton
          title={isEmailStep ? 'Send code' : 'Verify'}
          onPress={isEmailStep ? onSendCode : onVerify}
          disabled={submitting}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', rowGap: 16 },
  title: { fontSize: 40, letterSpacing: -0.8 },
  subtitle: { fontSize: type.body },
  input: {
    height: sizing.ctaHeight,
    borderRadius: radii.cta,
    borderWidth: sizing.choiceBorder,
    paddingHorizontal: 18,
    fontSize: type.body,
  },
  error: { fontSize: type.label },
  altAction: { fontSize: type.label, fontWeight: '600' },
  footer: { paddingBottom: 24 },
});

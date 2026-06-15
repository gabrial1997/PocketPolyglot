// SignInScreen — PocketPolyglot initial sign-on (Tier B standalone screen).
// Ported from the "PocketPolyglot Login (standalone)" mockup: wordmark, "Sveiki."
// headline, quiet email + password fields, a primary Continue, and cosmetic social
// buttons. Email + password are wired to Supabase (sign-in + create-account); Apple,
// Google and "Forgot password?" are intentionally cosmetic for now.
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Screen } from '../components';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, radii, sizing, type as typeScale } from '../theme/tokens';
import { useAuth } from './AuthProvider';

type Mode = 'signin' | 'signup';

// ── Wordmark: six-bar waveform + Spectral "PocketPolyglot" ────────────────
function Wordmark(): React.JSX.Element {
  const T = useTheme();
  const size = 18;
  const h = size * 1.15;
  const bars = [0.18, 0.62, 1.0, 0.72, 0.34, 0.18];
  return (
    <View style={styles.wordmark}>
      <View style={[styles.bars, { height: h }]}>
        {bars.map((b, i) => (
          <View
            key={i}
            style={{ width: 2.5, height: Math.max(3, b * h), borderRadius: 2, backgroundColor: T.primary }}
          />
        ))}
      </View>
      <Text style={[styles.wordmarkText, { color: T.ink, fontFamily: fonts.headline }]}>
        Pocket<Text style={{ color: T.primary }}>Polyglot</Text>
      </Text>
    </View>
  );
}

// ── Stroke / brand glyphs (match the kit's 1.7px stroke style) ────────────
function MailGlyph({ color }: { color: string }): React.JSX.Element {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={5.5} width={18} height={13} rx={3} />
      <Path d="M4 7.5l8 5 8-5" />
    </Svg>
  );
}
function LockGlyph({ color }: { color: string }): React.JSX.Element {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={10.5} width={16} height={10} rx={3} />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}
function ChevronRight({ color }: { color: string }): React.JSX.Element {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}
function AppleLogo({ color }: { color: string }): React.JSX.Element {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill={color}>
      <Path d="M16.36 1.43c0 1.14-.42 2.2-1.26 3.06-.92.95-2.02 1.5-3.2 1.41-.02-.13-.04-.27-.04-.41 0-1.1.48-2.18 1.27-2.99.4-.42.92-.77 1.55-1.05.62-.27 1.21-.42 1.76-.45.01.14.02.28.02.43zM20.5 17.13c-.3.69-.45 1-.83 1.61-.54.86-1.3 1.93-2.24 1.94-.84.01-1.05-.55-2.18-.54-1.13 0-1.37.55-2.21.54-.94-.01-1.66-.98-2.2-1.84-1.5-2.4-1.66-5.22-.73-6.72.66-1.07 1.7-1.69 2.69-1.69.99 0 1.62.55 2.43.55.8 0 1.29-.55 2.44-.55.87 0 1.79.47 2.45 1.29-2.15 1.18-1.8 4.25.62 5.4z" />
    </Svg>
  );
}
function GoogleLogo(): React.JSX.Element {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M21.6 12.23c0-.66-.06-1.29-.17-1.9H12v3.6h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.22z" />
      <Path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.06v2.58A10 10 0 0 0 12 22z" />
      <Path fill="#FBBC05" d="M6.42 13.91a6 6 0 0 1 0-3.82V7.5H3.06a10 10 0 0 0 0 9z" />
      <Path fill="#EA4335" d="M12 5.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86C16.96 2.99 14.7 2 12 2A10 10 0 0 0 3.06 7.5l3.36 2.6C7.2 7.72 9.4 5.96 12 5.96z" />
    </Svg>
  );
}

// ── A quiet text field ────────────────────────────────────────────────────
function Field(props: {
  icon: React.ReactNode;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  textContentType?: 'emailAddress' | 'password' | 'newPassword';
  autoComplete?: 'email' | 'password' | 'password-new';
  editable?: boolean;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const T = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View
      style={[
        styles.field,
        T.shadow,
        {
          backgroundColor: T.surface,
          borderColor: focus ? T.primary : T.hair,
        },
      ]}
    >
      <View style={styles.fieldIcon}>{props.icon}</View>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={props.placeholder}
        placeholderTextColor={T.faint}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType}
        textContentType={props.textContentType}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        autoCorrect={false}
        editable={props.editable}
        style={[styles.fieldInput, { color: T.ink }]}
      />
      {props.trailing}
    </View>
  );
}

export function SignInScreen(): React.JSX.Element {
  const T = useTheme();
  const { signInWithPassword, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignIn = mode === 'signin';

  function switchMode(): void {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
    setNotice(null);
  }

  async function onSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const e = email.trim();
    const p = password;
    if (isSignIn) {
      const { error: err } = await signInWithPassword(e, p);
      setSubmitting(false);
      if (err) setError(err);
      // On success the AuthProvider's onAuthStateChange swaps in the app (AuthGate).
    } else {
      const { error: err, confirmationRequired } = await signUp(e, p);
      setSubmitting(false);
      if (err) {
        setError(err);
        return;
      }
      if (confirmationRequired) {
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
    }
  }

  const primaryLabel = isSignIn ? 'Continue' : 'Create account';

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.wordmarkWrap}>
            <Wordmark />
          </View>

          <View style={styles.center}>
            {/* headline */}
            <View style={styles.headlineBlock}>
              <Text style={[styles.headline, { color: T.ink, fontFamily: fonts.headline }]}>Sveiki.</Text>
              <Text style={[styles.subhead, { color: T.sub }]}>
                {isSignIn
                  ? 'Sign in to pick up\nwhere you left off.'
                  : 'Create your account and start\nthe first 1,000 words.'}
              </Text>
            </View>

            {/* email + password */}
            <View style={styles.fields}>
              <Field
                icon={<MailGlyph color={T.faint} />}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                editable={!submitting}
              />
              <Field
                icon={<LockGlyph color={T.faint} />}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry={!showPw}
                textContentType={isSignIn ? 'password' : 'newPassword'}
                autoComplete={isSignIn ? 'password' : 'password-new'}
                editable={!submitting}
                trailing={
                  <Pressable
                    onPress={() => setShowPw((s) => !s)}
                    hitSlop={8}
                    accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
                  >
                    <Text style={[styles.showHide, { color: T.primary }]}>{showPw ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                }
              />
              {isSignIn ? (
                <View style={styles.forgotRow}>
                  {/* Cosmetic for now — wired up later. */}
                  <Pressable hitSlop={8} accessibilityLabel="Forgot password">
                    <Text style={[styles.forgot, { color: T.sub }]}>Forgot password?</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {notice ? <Text style={[styles.notice, { color: T.primary }]}>{notice}</Text> : null}
            {error ? <Text style={[styles.error, { color: T.record }]}>{error}</Text> : null}

            {/* primary continue */}
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={onSubmit}
              style={[styles.primary, T.shadow, { backgroundColor: T.primary, opacity: submitting ? 0.6 : 1 }]}
            >
              <Text style={[styles.primaryText, { color: T.onPrimary }]}>{primaryLabel}</Text>
              <ChevronRight color={T.onPrimary} />
            </Pressable>

            {/* divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.hair, { backgroundColor: T.hair }]} />
              <Text style={[styles.dividerText, { color: T.faint }]}>or continue with</Text>
              <View style={[styles.hair, { backgroundColor: T.hair }]} />
            </View>

            {/* social (cosmetic) */}
            <View style={styles.social}>
              <Pressable
                accessibilityRole="button"
                style={[styles.socialBtn, T.shadow, { backgroundColor: T.dark ? '#EAF1F8' : '#1A2733' }]}
              >
                <AppleLogo color={T.dark ? '#1A2733' : '#FFFFFF'} />
                <Text style={[styles.socialText, { color: T.dark ? '#1A2733' : '#FFFFFF' }]}>Continue with Apple</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.socialBtn, { backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.hair }]}
              >
                <GoogleLogo />
                <Text style={[styles.socialText, { color: T.ink }]}>Continue with Google</Text>
              </Pressable>
            </View>
          </View>

          {/* footer: switch mode */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: T.sub }]}>
              {isSignIn ? 'New to PocketPolyglot? ' : 'Already have an account? '}
            </Text>
            <Pressable onPress={switchMode} hitSlop={8}>
              <Text style={[styles.footerLink, { color: T.primary }]}>
                {isSignIn ? 'Create account' : 'Sign in'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: 24, paddingBottom: 24 },
  wordmarkWrap: { alignItems: 'center', paddingTop: 16 },
  wordmark: { flexDirection: 'row', alignItems: 'center', columnGap: 11 },
  bars: { flexDirection: 'row', alignItems: 'center', columnGap: 2.5 },
  wordmarkText: { fontSize: 18, letterSpacing: -0.2 },

  center: { flex: 1, justifyContent: 'center', rowGap: 18 },
  headlineBlock: { alignItems: 'center', rowGap: 12 },
  headline: { fontSize: 46, letterSpacing: -0.8, lineHeight: 48 },
  subhead: { fontSize: 15.5, lineHeight: 22, textAlign: 'center' },

  fields: { rowGap: 12 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 11,
    height: sizing.ctaHeight,
    borderRadius: radii.choice,
    borderWidth: sizing.choiceBorder,
    paddingHorizontal: 16,
  },
  fieldIcon: { flexShrink: 0 },
  fieldInput: { flex: 1, minWidth: 0, fontSize: typeScale.body, fontWeight: '500', padding: 0 },
  showHide: { fontSize: 13, fontWeight: '600' },
  forgotRow: { alignItems: 'flex-end' },
  forgot: { fontSize: 13.5, fontWeight: '600' },

  notice: { fontSize: typeScale.label },
  error: { fontSize: typeScale.label },

  primary: {
    height: sizing.ctaHeight,
    borderRadius: radii.cta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  primaryText: { fontSize: 17, fontWeight: '600' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', columnGap: 14 },
  hair: { flex: 1, height: 1 },
  dividerText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.4 },

  social: { rowGap: 11 },
  socialBtn: {
    height: 54,
    borderRadius: radii.choice,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 11,
  },
  socialText: { fontSize: typeScale.body, fontWeight: '600' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 18 },
  footerText: { fontSize: 14.5 },
  footerLink: { fontSize: 14.5, fontWeight: '700' },
});

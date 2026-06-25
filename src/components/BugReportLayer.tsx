// Beta tooling overlay: a floating "report a bug" button on every authenticated screen.
// Captures the current screen, collects context, and submits via the injected BugReportService.
// NOT a card — it is shell-level UI and may read useServices().
import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Platform, ActivityIndicator, SafeAreaView,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import Constants from 'expo-constants';
import { captureScreen } from 'react-native-view-shot';
import { useServices } from '../services/ServiceProvider';
import { useTheme } from '../theme/ThemeProvider';

// Screen-tag context: descendants call useSetReportScreen()(name) to label where a report came from.
const SetScreenContext = createContext<(screen: string) => void>(() => {});
export function useSetReportScreen(): (screen: string) => void {
  return useContext(SetScreenContext);
}

export function BugReportLayer({ children }: { children: React.ReactNode }): React.JSX.Element {
  const T = useTheme();
  const { bugReport } = useServices();
  const [screen, setScreen] = useState('app');
  const [open, setOpen] = useState(false);
  const [shotUri, setShotUri] = useState<string | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSheet = useCallback(async () => {
    let uri: string | undefined;
    try {
      uri = await captureScreen({ format: 'png', quality: 0.8 });
    } catch {
      uri = undefined; // best-effort; text-only still works
    }
    setShotUri(uri);
    setError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setText('');
    setShotUri(undefined);
    setError(null);
  }, []);

  const send = useCallback(async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await bugReport.submit({
        description: text.trim(),
        screen,
        screenshotUri: shotUri,
        appVersion: Constants.expoConfig?.version ?? 'dev',
        platform: Platform.OS,
        osVersion: String(Platform.Version),
      });
      setBusy(false);
      close();
    } catch {
      // Keep the typed text so the tester can retry.
      setBusy(false);
      setError('Could not send — try again.');
    }
  }, [text, busy, bugReport, screen, shotUri, close]);

  return (
    <SetScreenContext.Provider value={setScreen}>
      <View style={styles.fill}>
        {children}
        {!open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report a bug"
            onPress={openSheet}
            style={[styles.fab, { backgroundColor: T.primary }]}
          >
            <Text style={styles.fabGlyph}>🐞</Text>
          </Pressable>
        ) : null}
        {open ? (
          <View style={styles.overlay}>
            {/* Backdrop: a tap anywhere outside the sheet drops the keyboard so it never
                gets stuck covering the input (the multiline field has no return-to-dismiss). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              style={styles.backdrop}
              onPress={Keyboard.dismiss}
            />
            <KeyboardAvoidingView
              style={styles.kav}
              pointerEvents="box-none"
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <SafeAreaView style={styles.sheetWrap}>
                <View style={[styles.sheet, { backgroundColor: T.bg, borderColor: T.hair }]}>
                  <Text style={[styles.title, { color: T.ink }]}>Report a bug</Text>
              {shotUri ? (
                <Text style={[styles.meta, { color: T.faint }]}>Screenshot attached</Text>
              ) : (
                <Text style={[styles.meta, { color: T.faint }]}>No screenshot (capture failed)</Text>
              )}
              <TextInput
                placeholder="What went wrong?"
                placeholderTextColor={T.faint}
                value={text}
                onChangeText={setText}
                multiline
                style={[styles.input, { color: T.ink, borderColor: T.hair }]}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                <Pressable accessibilityRole="button" onPress={close} style={styles.btn}>
                  <Text style={{ color: T.faint }}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={send}
                  disabled={!text.trim() || busy}
                  style={[styles.btn, styles.send, { backgroundColor: T.primary, opacity: !text.trim() || busy ? 0.5 : 1 }]}
                >
                  {busy ? <ActivityIndicator color={T.onPrimary} /> : <Text style={[styles.sendText, { color: T.onPrimary }]}>Send report</Text>}
                </Pressable>
              </View>
                </View>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </View>
    </SetScreenContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: {
    position: 'absolute', right: 16, bottom: 96, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', opacity: 0.6,
  },
  fabGlyph: { fontSize: 20 },
  // Full-screen overlay holding a tap-to-dismiss backdrop + the keyboard-avoiding sheet.
  overlay: { ...StyleSheet.absoluteFillObject },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  // KAV fills the overlay and bottom-aligns the sheet; box-none lets taps above the sheet
  // fall through to the backdrop. behavior:'padding' (iOS) floats the sheet above the keyboard.
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheetWrap: { left: 0, right: 0, bottom: 0 },
  sheet: { margin: 12, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  meta: { fontSize: 12, marginBottom: 8 },
  input: { minHeight: 80, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, textAlignVertical: 'top' },
  error: { color: '#C0392B', marginTop: 8 }, // intentional hardcoded error/danger color (no theme token)
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  send: {},
  sendText: { fontWeight: '700' },
});

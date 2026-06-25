import React, { useEffect } from 'react';
import { Text, Keyboard } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ServiceProvider } from '../services/ServiceProvider';
import { createStubServices } from '../services/stubs';
import type { ServiceBundle, BugReportInput } from '../services';
import { ThemeProvider } from '../theme/ThemeProvider';
import { BugReportLayer, useSetReportScreen } from './BugReportLayer';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('QkFTRTY0UE5H'), // base64 PNG bytes (result:'base64')
}));

function renderLayer(submit: (i: BugReportInput) => Promise<void>, child?: React.ReactNode) {
  const services = { ...createStubServices(), bugReport: { submit } } as ServiceBundle;
  return render(
    <ThemeProvider>
      <ServiceProvider services={services}>
        <BugReportLayer>{child ?? <Text>content</Text>}</BugReportLayer>
      </ServiceProvider>
    </ThemeProvider>,
  );
}

describe('BugReportLayer', () => {
  it('tapping the FAB opens the report sheet (captures the screen)', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByPlaceholderText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => expect(getByPlaceholderText('What went wrong?')).toBeTruthy());
  });

  it('submitting calls bugReport.submit with description + screenshot + context', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByPlaceholderText, getByText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.changeText(getByPlaceholderText('What went wrong?'), 'the orb is stuck');
    fireEvent.press(getByText('Send report'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const arg = submit.mock.calls[0][0] as BugReportInput;
    expect(arg.description).toBe('the orb is stuck');
    expect(arg.screenshotBase64).toBe('QkFTRTY0UE5H');
    expect(typeof arg.appVersion).toBe('string');
    expect(typeof arg.platform).toBe('string');
  });

  it('submit failure keeps the typed text and re-enables sending', async () => {
    const submit = jest.fn().mockRejectedValue(new Error('rls'));
    const { getByLabelText, getByPlaceholderText, getByText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.changeText(getByPlaceholderText('What went wrong?'), 'keep me');
    fireEvent.press(getByText('Send report'));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    // Text preserved after failure.
    expect(getByPlaceholderText('What went wrong?').props.value).toBe('keep me');
  });

  it('tapping the backdrop dismisses the keyboard (so it never gets stuck over the input)', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const submit = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByPlaceholderText } = renderLayer(submit);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.press(getByLabelText('Dismiss keyboard'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('useSetReportScreen tags the screen passed to submit', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    function Tagger() {
      const setScreen = useSetReportScreen();
      useEffect(() => setScreen('podcast'), [setScreen]);
      return <Text>tagged</Text>;
    }
    const { getByLabelText, getByPlaceholderText, getByText } = renderLayer(submit, <Tagger />);
    fireEvent.press(getByLabelText('Report a bug'));
    await waitFor(() => getByPlaceholderText('What went wrong?'));
    fireEvent.changeText(getByPlaceholderText('What went wrong?'), 'x');
    fireEvent.press(getByText('Send report'));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect((submit.mock.calls[0][0] as BugReportInput).screen).toBe('podcast');
  });
});

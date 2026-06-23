// EditorProvider.test.tsx — TDD tests for EditorProvider + useEditor (Task F2)
// Tests: (1) isEditor→true; (2) isEditor→false; (3) isEditor rejects (fail-closed); (4) outside provider.
import React from 'react';
import { Text, View } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ServiceProvider } from './ServiceProvider';
import { createStubServices } from './stubs';
import { EditorProvider, useEditor } from './EditorProvider';

// Helper: renders a component that reads useEditor() and displays enabled as a text node.
function EditorFlagDisplay(): React.JSX.Element {
  const { enabled } = useEditor();
  return <Text testID="flag">{String(enabled)}</Text>;
}

// Helper: wraps in ServiceProvider + EditorProvider.
function renderWithEditor(isEditorResolves: boolean | 'reject') {
  const services = createStubServices();
  if (isEditorResolves === 'reject') {
    services.editor.isEditor = (): Promise<boolean> => Promise.reject(new Error('network error'));
  } else {
    services.editor.isEditor = (): Promise<boolean> => Promise.resolve(isEditorResolves);
  }

  return render(
    <ServiceProvider services={services}>
      <EditorProvider>
        <EditorFlagDisplay />
      </EditorProvider>
    </ServiceProvider>,
  );
}

describe('EditorProvider + useEditor', () => {
  it('isEditor()→true → enabled becomes true after effect', async () => {
    const u = renderWithEditor(true);
    // Initially false (not yet resolved)
    expect(u.getByTestId('flag').props.children).toBe('false');
    // After the promise resolves
    await waitFor(() => {
      expect(u.getByTestId('flag').props.children).toBe('true');
    });
  });

  it('isEditor()→false → enabled stays false', async () => {
    const u = renderWithEditor(false);
    await waitFor(() => {
      // Give the effect time to flush; result should still be false
      expect(u.getByTestId('flag').props.children).toBe('false');
    });
  });

  it('isEditor() rejects → enabled stays false (fail-closed, no throw)', async () => {
    const u = renderWithEditor('reject');
    await waitFor(() => {
      expect(u.getByTestId('flag').props.children).toBe('false');
    });
    // Ensure no error boundary was triggered — element is still mounted
    expect(u.getByTestId('flag')).toBeTruthy();
  });

  it('useEditor() outside a provider → returns { enabled: false } without throwing', () => {
    // Render WITHOUT EditorProvider in the tree
    const u = render(
      <View>
        <EditorFlagDisplay />
      </View>,
    );
    expect(u.getByTestId('flag').props.children).toBe('false');
  });
});

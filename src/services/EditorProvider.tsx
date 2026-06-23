// EditorProvider — resolves the founder editor flag once and caches it in context.
// The session host reads `useEditor().enabled` to decide whether to render edit affordances.
// Cards never read this (they stay pure).
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useServices } from './ServiceProvider';

interface EditorContextValue {
  enabled: boolean;
}

// Default false until resolved; fail-closed outside provider.
const EditorContext = createContext<EditorContextValue>({ enabled: false });

/** Resolves the founder flag once from services.editor.isEditor(); default false until resolved. */
export function EditorProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const { editor } = useServices();

  useEffect(() => {
    let active = true;
    editor
      .isEditor()
      .then((result) => {
        if (active) setEnabled(result);
      })
      .catch(() => {
        // Fail-closed: any rejection keeps enabled=false.
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [editor]);

  return <EditorContext.Provider value={{ enabled }}>{children}</EditorContext.Provider>;
}

/** Read the resolved founder flag. Returns { enabled: false } outside a provider (fail-closed). */
export function useEditor(): { enabled: boolean } {
  // The default context value is { enabled: false }, so this is safe outside a provider.
  return useContext(EditorContext);
}

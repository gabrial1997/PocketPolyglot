// ServiceProvider — injects the ServiceBundle so cards never import services directly
// (BACKEND_INTEGRATION §5). The controller pulls services from here; screens get only
// callbacks + data, never the service instances.
import React, { createContext, useContext } from 'react';
import type { ServiceBundle } from './index';
import { createStubServices } from './stubs';

const ServiceContext = createContext<ServiceBundle | null>(null);

export function ServiceProvider({
  services,
  children,
}: {
  services?: ServiceBundle;
  children: React.ReactNode;
}): React.JSX.Element {
  // Default to stubs so the scaffold runs before real services are wired.
  const value = services ?? createStubServices();
  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

/** Controller-only hook to read services. Cards must NOT call this. */
export function useServices(): ServiceBundle {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useServices must be used within a ServiceProvider');
  return ctx;
}

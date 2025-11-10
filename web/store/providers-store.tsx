'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ProviderSummary, ProviderUpdate } from '@/lib/types';

interface ProvidersState {
  providers: Record<string, ProviderSummary>;
  upsertMany: (items: ProviderSummary[]) => void;
  updateProvider: (update: ProviderUpdate) => void;
}

const ProvidersContext = createContext<ProvidersState | undefined>(undefined);

export function ProvidersStoreProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = useState<Record<string, ProviderSummary>>({});

  const upsertMany = useCallback((items: ProviderSummary[]) => {
    setProviders((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[item.id] = { ...next[item.id], ...item };
      }
      return next;
    });
  }, []);

  const updateProvider = useCallback((update: ProviderUpdate) => {
    setProviders((prev) => ({
      ...prev,
      [update.id]: {
        ...prev[update.id],
        ...update,
      },
    }));
  }, []);

  const value = useMemo(
    () => ({
      providers,
      upsertMany,
      updateProvider,
    }),
    [providers, upsertMany, updateProvider],
  );

  return <ProvidersContext.Provider value={value}>{children}</ProvidersContext.Provider>;
}

export function useProvidersStore() {
  const context = useContext(ProvidersContext);
  if (!context) {
    throw new Error('useProvidersStore must be used within a ProvidersStoreProvider');
  }
  return context;
}

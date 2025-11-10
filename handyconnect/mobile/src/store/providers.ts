import { create } from 'zustand';

import { Provider } from '../components/ProviderCard';

interface ProvidersState {
  providers: Record<string, Provider>;
  upsertMany: (providers: Provider[]) => void;
  updateProvider: (provider: Partial<Provider> & { id: string }) => void;
}

export const useProvidersStore = create<ProvidersState>((set) => ({
  providers: {},
  upsertMany: (items) =>
    set((state) => {
      const next = { ...state.providers };
      items.forEach((item) => {
        next[item.id] = {
          ...next[item.id],
          ...item,
        };
      });
      return { providers: next };
    }),
  updateProvider: (provider) =>
    set((state) => ({
      providers: {
        ...state.providers,
        [provider.id]: {
          ...state.providers[provider.id],
          ...provider,
        },
      },
    })),
}));

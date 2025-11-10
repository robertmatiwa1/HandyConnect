import { create } from 'zustand';

import { clearCredentials, getStoredCredentials, storeCredentials } from '../utils/secureStore';

interface AuthState {
  token: string | null;
  userId: string | null;
  role: string | null;
  initialized: boolean;
  setCredentials: (token: string, userId: string, role: string) => Promise<void>;
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  userId: null,
  role: null,
  initialized: false,
  setCredentials: async (token, userId, role) => {
    await storeCredentials(token, userId, role);
    set({ token, userId, role, initialized: true });
  },
  clear: async () => {
    await clearCredentials();
    set({ token: null, userId: null, role: null, initialized: true });
  },
  hydrate: async () => {
    if (get().initialized) {
      return;
    }

    const { token, userId, role } = await getStoredCredentials();
    set({ token: token ?? null, userId: userId ?? null, role: role ?? null, initialized: true });
  },
}));

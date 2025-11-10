import { create } from 'zustand';

interface AuthState {
  token: string | null;
  userId: string | null;
  setCredentials: (token: string, userId: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  setCredentials: (token, userId) => set({ token, userId }),
  clear: () => set({ token: null, userId: null })
}));

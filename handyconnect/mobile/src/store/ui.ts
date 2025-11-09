import { create } from 'zustand';

interface UIState {
  isLoading: boolean;
  setLoading: (value: boolean) => void;
  toast?: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  toast: null,
  setLoading: (value) => set({ isLoading: value }),
  showToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null })
}));

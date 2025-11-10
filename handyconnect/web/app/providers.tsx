'use client';

import { ProvidersStoreProvider } from '@/store/providers-store';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ProvidersStoreProvider>{children}</ProvidersStoreProvider>;
}

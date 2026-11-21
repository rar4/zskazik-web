'use client';

import { useState, type ReactNode } from 'react';
import { WagmiProvider, cookieToInitialState, type Config } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Importing lib/appkit creates the wagmi adapter/config and, when a project
// id is set, the AppKit modal singleton (module scope, exactly once).
import { wagmiConfig } from '../lib/appkit';

export function Providers({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  // Cookie hydration: with ssr:true wagmi persists the connection in a
  // cookie, so a reconnecting wallet renders the same state on server and
  // client instead of flashing "connect" on every reload.
  const initialState = cookieToInitialState(wagmiConfig as Config, cookies);
  return (
    <WagmiProvider config={wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

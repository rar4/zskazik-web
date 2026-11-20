'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { sepolia } from 'viem/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';
import { walletConnect } from 'wagmi/connectors';
import { useState } from 'react';

const rpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export function Providers({ children }: { children: React.ReactNode }) {
  const [config] = useState(() => {
    // Single injected connector. With multiInjectedProviderDiscovery,
    // OKX Wallet shows up automatically as its own EIP-6963 connector
    // (id "okx-wallet") — a second fake injected() wrapper around the
    // same provider made connect() race and surface a phantom error.
    const connectors: any[] = [injected({ shimDisconnect: true })];
    if (wcProjectId) connectors.push(walletConnect({ projectId: wcProjectId }));
    return createConfig({
      chains: [sepolia],
      connectors,
      transports: { [sepolia.id]: http(rpc) },
      // If the wallet is on another chain (e.g. mainnet), don't fail the
      // connect — let the UI prompt a switch to Sepolia.
      multiInjectedProviderDiscovery: true,
    });
  });
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

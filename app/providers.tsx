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
    const connectors: any[] = [
      injected(),
      // OKX Wallet (EIP-6963 id "okx-wallet") — shows up when OKX extension is present
      (injected as any)({ id: 'okx-wallet', name: 'OKX Wallet', target: { id: 'okx-wallet' } }),
    ];
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

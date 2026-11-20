'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';
import { walletConnect } from 'wagmi/connectors';
import { useState } from 'react';

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111);
const rpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const chain = {
  id: chainId,
  name: 'Sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
  testnet: true,
} as const;

export function Providers({ children }: { children: React.ReactNode }) {
  const [config] = useState(() => {
    const connectors: any[] = [
      injected(),
      // OKX Wallet (EIP-6963 id "okx-wallet") — shows up when OKX extension is present
      (injected as any)({ id: 'okx-wallet', name: 'OKX Wallet', target: { id: 'okx-wallet' } }),
    ];
    if (wcProjectId) connectors.push(walletConnect({ projectId: wcProjectId }));
    return createConfig({
      chains: [chain],
      connectors,
      transports: { [chainId]: http(rpc) } as any,
    });
  });
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

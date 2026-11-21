import { createConfig, http, injected } from '@wagmi/core';
import { sepolia } from 'viem/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import type { AppKitNetwork } from '@reown/appkit/networks';

// Reown AppKit project id (dashboard.reown.com). NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
// is accepted as a deprecated alias for the same WalletConnect/Reown project.
export const projectId =
  process.env.NEXT_PUBLIC_APPKIT_PROJECT_ID ||
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  '';

export const appKitEnabled = Boolean(projectId);

const rpc =
  process.env.NEXT_PUBLIC_RPC_URL ||
  'https://ethereum-sepolia-rpc.publicnode.com';

// Public origin of this app. Must match the domain allowlisted in the Reown
// dashboard, otherwise WalletConnect universal links/deep links refuse to open.
export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || 'https://zskazik-web.vercel.app';

export const metadata = {
  name: 'ZSKazik',
  description: 'On-chain casino on Sepolia: CoinFlip, Dice, Plinko',
  url: appUrl,
  icons: [`${appUrl}/icon.svg`],
};

// Sepolia only: every contract this app talks to is deployed there, so the
// modal must never offer to connect on any other chain.
export const networks = [sepolia] as unknown as [AppKitNetwork, ...AppKitNetwork[]];

// With a project id, WagmiAdapter owns the wagmi config and registers the
// connectors AppKit's modal needs: WalletConnect (500+ mobile / QR wallets),
// Coinbase Wallet, injected (MetaMask, OKX, Rabby, Brave, ... via EIP-6963),
// plus email/social auth. Without one, fall back to injected-only wagmi so
// the app still builds and browser-extension wallets keep working — the full
// wallet list unlocks the moment NEXT_PUBLIC_APPKIT_PROJECT_ID is set.
export const wagmiAdapter = appKitEnabled
  ? new WagmiAdapter({
      networks,
      projectId,
      ssr: true,
      transports: { [sepolia.id]: http(rpc) },
    })
  : undefined;

export const wagmiConfig = wagmiAdapter
  ? wagmiAdapter.wagmiConfig
  : createConfig({
      chains: [sepolia],
      // Single injected connector. With multiInjectedProviderDiscovery,
      // MetaMask/OKX/Rabby etc. show up automatically as their own
      // EIP-6963 connectors — a second hand-made injected() wrapper
      // around the same provider makes connect() race (see git history).
      // unstable_shimAsyncInject: OKX/MetaMask inject window.ethereum
      // asynchronously (ethereum#initialized) — let wagmi wait for it
      // during reconnect checks instead of reporting "Provider not found".
      connectors: [injected({ shimDisconnect: true, unstable_shimAsyncInject: true })],
      transports: { [sepolia.id]: http(rpc) },
      ssr: true,
      multiInjectedProviderDiscovery: true,
    });

// Modal singleton. createAppKit must run exactly once at module scope —
// calling it inside a component would create a broken second instance on
// every re-render. No-op when AppKit is disabled (see above).
export const modal = appKitEnabled
  ? createAppKit({
      adapters: [wagmiAdapter!],
      networks,
      defaultNetwork: sepolia as unknown as AppKitNetwork,
      projectId,
      metadata,
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#6c5ce7',
        '--w3m-color-mix': '#6c5ce7',
      },
      features: {
        analytics: false,
      },
    })
  : undefined;

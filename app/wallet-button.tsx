'use client';

import { useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { appKitEnabled } from '../lib/appkit';

const btn = {
  padding: '10px 16px',
  borderRadius: 10,
  border: 0,
  background: '#6c5ce7',
  color: '#fff',
  cursor: 'pointer',
} as const;

/**
 * Wallet entry point.
 *
 * AppKit mode (project id set): <appkit-button /> opens the Reown modal —
 * WalletConnect QR/deep-link for 500+ mobile wallets (MetaMask, Trust,
 * Phantom, OKX mobile, ...), Coinbase Wallet, every EIP-6963 browser
 * extension (MetaMask, OKX, Rabby, Brave, ...), and email/social sign-in.
 * When connected it becomes the account button (address, balance, network,
 * disconnect), so no hand-rolled connect/disconnect UI is needed.
 *
 * Fallback mode (no project id): plain wagmi connectors (injected only),
 * with the connect error surfaced — see lib/appkit.ts.
 */
export default function WalletButton() {
  const { isConnected, address } = useAccount();

  if (appKitEnabled) {
    // useAppKit must be called unconditionally — it is a no-op (modal
    // undefined) in fallback mode, but hooks can't be conditional.
    return <AppKitButton />;
  }

  return <FallbackButton isConnected={isConnected} address={address} />;
}

function AppKitButton() {
  // Referenced so the hook registration is explicit; <appkit-button />
  // itself reads the modal singleton created in lib/appkit.ts.
  useAppKit();
  return <appkit-button />;
}

function FallbackButton({
  isConnected,
  address,
}: {
  isConnected: boolean;
  address?: string;
}) {
  const { connect, connectors, error: connectError, isPending, reset: resetConnect } = useConnect();
  const { disconnect } = useDisconnect();

  // wagmi keeps the last connect error even after a retry succeeds.
  useEffect(() => {
    if (isConnected) resetConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  if (isConnected) {
    return (
      <button style={btn} onClick={() => disconnect()}>
        {address?.slice(0, 8)}… disconnect
      </button>
    );
  }

  const onConnect = () => {
    const c = connectors.find((x: any) => x.id === 'okx-wallet') || connectors[0];
    if (!c) return;
    connect({ connector: c });
  };

  return (
    <div>
      <button style={btn} disabled={isPending || !connectors.length} onClick={onConnect}>
        {isPending ? 'connecting…' : connectors.length ? 'connect wallet' : 'no wallet found'}
      </button>
      {!connectors.length && (
        <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
          No wallet detected — install MetaMask or OKX Wallet and reload, or set
          NEXT_PUBLIC_APPKIT_PROJECT_ID to enable all wallets via AppKit.
        </div>
      )}
      {connectError && (
        <div style={{ color: '#ff9', marginTop: 6 }}>connect failed: {connectError.message}</div>
      )}
    </div>
  );
}

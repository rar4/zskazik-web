'use client';

import { useEffect, useRef, useState } from 'react';
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

// EIP-6963 discovered wallets get connector id = their rdns (e.g. OKX is
// "io.okx.wallet"), never a plain "okx-wallet". The generic injected
// connector (id "injected") only reads window.ethereum, which OKX does
// not reliably set — connecting through it throws ProviderNotFoundError
// while the discovered OKX connector then auto-connects on its own
// 'connect' event. So: always prefer a discovered wallet over the
// generic injected one.
function pickConnector(connectors: any[]) {
  const discovered = connectors.filter((c: any) => c.id !== 'injected');
  const okx = discovered.find(
    (c: any) => c.id === 'io.okx.wallet' || /okx/i.test(c.name || ''),
  );
  return okx || discovered[0] || connectors[0];
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
  const [notice, setNotice] = useState('');
  const connectorsRef = useRef(connectors);
  connectorsRef.current = connectors;

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

  const onConnect = async () => {
    setNotice('');
    // Wait for the wallet to finish injecting instead of firing connect()
    // into a not-yet-present provider (which throws ProviderNotFoundError
    // and then "connects anyway" when the wallet announces itself).
    // EIP-6963 wallets like OKX announce asynchronously after page load.
    for (let i = 0; i < 30; i++) {
      const c = pickConnector(connectorsRef.current as any[]);
      if (c && c.id !== 'injected') {
        connect({ connector: c });
        return;
      }
      if (c && typeof window !== 'undefined' && (window as any).ethereum) {
        connect({ connector: c });
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    setNotice(
      'No wallet detected yet — if you use OKX/MetaMask, open it once, then try again.',
    );
  };

  // ProviderNotFoundError is transient ("wallet still injecting"), not a
  // failure — never show it as a "connect failed" banner.
  const showError =
    connectError &&
    (connectError as any).name !== 'ProviderNotFoundError' &&
    !/Provider not found/i.test(connectError.message);

  return (
    <div>
      <button style={btn} disabled={isPending} onClick={onConnect}>
        {isPending ? 'connecting…' : 'connect wallet'}
      </button>
      {notice && <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>{notice}</div>}
      {showError && (
        <div style={{ color: '#ff9', marginTop: 6 }}>connect failed: {connectError.message}</div>
      )}
    </div>
  );
}

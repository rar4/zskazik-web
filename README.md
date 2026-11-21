# zskazik-web — casino frontend + backend in one Next.js app (Vercel-ready)

Next.js 14 App Router. Pages are the wallet/game UI (wagmi + viem, ABIs in
`abi/` exported via `forge inspect`). API routes (`app/api/*`) replace the old
express backend: they read the chain directly with viem `getLogs` — no database,
nothing to host, works on Vercel serverless.

## Local run

```bash
cp .env.example .env.local   # fill RPC + deployed addresses, START_BLOCK = treasury deploy block
npm install
npm run dev                  # :3000
```

## Wallet connection (Reown AppKit)

Wallet connect is handled by Reown AppKit (`lib/appkit.ts`,
`app/wallet-button.tsx`), on top of wagmi:

- With a project id, the AppKit modal offers every popular wallet:
  WalletConnect QR/deep-link (MetaMask, Trust, Phantom, OKX mobile, 500+
  more), Coinbase Wallet, all EIP-6963 browser extensions (MetaMask, OKX,
  Rabby, Brave, ...), and email/social sign-in. The header button becomes
  the account button once connected (address, network, disconnect).
- Without a project id the app falls back to injected-only wagmi so it
  still builds and extension wallets work; the full modal unlocks as soon
  as the id is set.

To enable it:

1. Create a project at https://dashboard.reown.com and copy its project id.
2. Set `NEXT_PUBLIC_APPKIT_PROJECT_ID=<id>` (locally in `.env.local`, and
   in Vercel project env vars). `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   still works as a deprecated alias for the same id.
3. In the Reown dashboard, allowlist your production domain, and set
   `NEXT_PUBLIC_APP_URL` to that origin (WalletConnect uses it as the
   metadata url; it must match the allowlisted domain).

## Deploy on Vercel (push-to-deploy)

The Vercel project is Git-connected (`rar4/zskazik-web`, production branch
`main`): every push to `main` automatically builds and deploys to
production at https://zskazik-web.vercel.app. No manual deploy step needed.

(The earlier GitHub Actions `vercel deploy` workflow was removed once the
native Git connection was set up — it would have double-deployed.)

Notes:
- `START_BLOCK` must be the block your contracts were deployed at — log scans
  start there, otherwise public RPCs will refuse the range.
- Testnet randomness: games resolve in a later block. Mainnet needs Chainlink
  VRF in `GameBase._random` before real money.
- History/leaderboard are derived from logs per request (fine for beta scale;
  add Postgres/Upstash when volume grows).

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

The Vercel project was created via CLI and is not Git-connected, so a push
alone does not deploy. `.github/workflows/vercel.yml` closes that gap: every
push to `main` runs `vercel deploy --prod` against the existing project
(env vars, domains and aliases are preserved — no new project is created).

One-time setup: create a token at https://vercel.com/account/tokens and
add it as repo secret `VERCEL_TOKEN` (`gh secret set VERCEL_TOKEN`).
Until the secret exists the workflow run fails harmlessly; every later push
(and manual runs via Actions → "deploy-vercel" → Run workflow) deploys.

Permanent alternative: Vercel dashboard → Project → Settings → Git →
Connect Git Repository (`rar4/zskazik-web`). Once connected, Vercel deploys
on push natively and the workflow can be deleted.

Manual deploy from this machine (no GitHub Actions): `npx vercel deploy
--prod --yes` from this folder.

Notes:
- `START_BLOCK` must be the block your contracts were deployed at — log scans
  start there, otherwise public RPCs will refuse the range.
- Testnet randomness: games resolve in a later block. Mainnet needs Chainlink
  VRF in `GameBase._random` before real money.
- History/leaderboard are derived from logs per request (fine for beta scale;
  add Postgres/Upstash when volume grows).

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

## Deploy on Vercel

1. Push this folder to a git repo (or `vercel` CLI from here).
2. Import in Vercel, set the same env vars as `.env.example`
   (use a public RPC for `RPC_URL` / `NEXT_PUBLIC_RPC_URL`).
3. Deploy. No build config needed (`npm run build` default).

Notes:
- `START_BLOCK` must be the block your contracts were deployed at — log scans
  start there, otherwise public RPCs will refuse the range.
- Testnet randomness: games resolve in a later block. Mainnet needs Chainlink
  VRF in `GameBase._random` before real money.
- History/leaderboard are derived from logs per request (fine for beta scale;
  add Postgres/Upstash when volume grows).

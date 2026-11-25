# ZSKazik — Casino UI/UX Research & Improvement Report

Research date: 2026-11-25. Sources: Stake, Roobet, BC.Game, Rollbit and
industry UX literature (see Sources). Every recommendation is mapped to
what ZSKazik has today (audit of `app/casino.tsx`, `app/bet-animation.tsx`,
`app/api/*`, `lib/*` at commit 32abcec) and sequenced by impact vs effort.

---

## 1. Executive summary

Commercially successful crypto casinos win on four things, in order:

1. **Time-to-first-bet** — most players who never bet leave in the first
   few minutes. Every extra step between landing and placing a bet is
   churn (Altenar / industry data). Stake's whole redesign brief was
   "don't make people think": homepage → game in seconds, search and
   filters that answer in one scan.
2. **Trust made visible** — provably-fair verification, live bet feeds,
   instant balances, one-click withdrawals sitting next to deposits.
   Players who don't trust the money moments (bet, settle, cash out)
   check balances repeatedly and leave.
3. **Retention machinery** — VIP tiers, rakeback, races, loyalty that
   never resets. This is where the money is: acquiring a player costs
   far more than keeping one, and every top operator runs a wager-based
   ladder (Stake Bronze→Obsidian, Roobet's rakeback every 30 min,
   BC.Game's monthly deposit bonuses).
4. **Responsible-play tooling as a feature, not a footer** — deposit/
   loss limits, session timers, self-exclusion in plain language,
   two clicks from anywhere. Framed as "account controls" (like a
   banking app), adoption is far higher than framed as intervention.

ZSKazik today is a functional on-chain demo: three games, one-click
session-key betting (genuinely best-in-class — 0 popups, which most
casinos cannot match), on-chain settlement, bet history. It has none of
the four layers above. The gap is not the games; it is everything
around them. The roadmap in section 8 closes that gap in dependency
order: first make the lobby and bet flow instant and trustworthy
(P0), then add retention and social proof (P1), then polish and
compliance-grade tooling (P2). A licensing/KYC note is in section 9 —
none of this ships as a real-money product without it.

---

## 2. What the leaders do (and why it works)

| Operator | Lobby / discovery | Money flow | Trust | Retention | Social |
|---|---|---|---|---|---|
| **Stake** | Left rail: saved, following, continue playing, categories; search + provider filters; live player counts per game; algorithmic home feed | Deposit/withdraw adjacent in cashier; 20+ cryptos; instant crypto payouts | Provably-fair Originals (Dice, Plinko, Mines, Limbo…); RTP on game cards | VIP Bronze→Obsidian by wagering; weekly + monthly bonuses, rakeback, level-up rewards | Live bet feed, race leaderboards |
| **Roobet** | 7,000+ games, vault, Live RTP board | Instant rakeback every 30 min; crypto cashouts ~15 min | Provably-fair Originals; public Live RTP board (no close equal) | Open rank ladder by wagering alone; raffles ($100k/100 winners) | Live RTP board is itself social proof |
| **BC.Game** | 145+ coins; monthly (not one-off) deposit bonuses | Lightning deposits; 5–30 min withdrawals; coin swap in wallet | Own provably-fair Originals; session timers in header | VIP status transfer from other casinos; daily spins; monthly 4-stage bonuses | Discord/Telegram communities |
| **Rollbit** | Searchable, filtered lobby; Originals + slots + live + futures | 33 coins / 13 networks, no operator fees; withdraw tab beside deposit | Provably-fair Originals with committed seed you can recompute | Rakeback 5–15%, daily race ($25k), RLB lottery, challenges; **no wagering on rewards** | Discord events, race leaderboards |
| **Industry standard** (UX literature) | Intent-based filters, "recently played" one-tap resume, game cards with RTP/volatility in plain language | One-click payments; deposit inside the game flow, never a separate cashier trip | Per-round verification; settlement explanations; consistent balances | Progress trackers, achievements, leaderboards — useful only when they don't bury discovery | Live bets, chat, "because you played X" recommendations |

Patterns that repeat in every winner:

- **Category in 5 seconds.** If a new player cannot identify their game
  type within five seconds of landing, they leave. Categories are
  persistent nav, never a dropdown.
- **The game card is a promise.** Art + title + one payoff fact
  ("RTP 99%", "High volatility — bigger, rarer wins"). One or two facts;
  eight badges kill conversion.
- **Recent/favourite = one tap.** The single highest-value decision in
  lobby design is the persistent "recently played" row.
- **Fees and terms in one click.** Rollbit's norm: an offer's full terms
  open in a single click, rewards carry no wagering, withdrawals are
  not hidden. Hidden wagering is the #1 trust complaint industry-wide.
- **Support in minutes.** Stake/Roobet/BC.Game live chat answers in
  ~1–2 minutes, 24/7. Reviewers treat response time as a score input.
- **Personalization without pressure.** "Because you liked Blackjack,
  try these" + toggles to hide categories. No hidden timers, no
  disguised opt-ins.

---

## 3. Gap analysis: ZSKazik today vs the standard

### 3.1 Navigation & lobby — MISSING
Today: a single page, four tabs (flip / dice / plinko / history), no
lobby, no search, no categories, no game art, no provider/Originals
distinction (`casino.tsx:524-528`). With 3 games a lobby looks
unnecessary, but the standard applies anyway: a new player sees tab
labels, not a product. There is no "continue playing", no favourites,
no entry point for a returning player beyond re-finding the tab.

### 3.2 Bet flow — GOOD CORE, ROUGH EDGES
Strengths: session-key 1-click betting (0 popups for 30 days) is
better than Stake's flow; preflight simulation names the real revert
reason instead of a wrapper selector; explicit gas limits avoid wallet
estimation failures. Rough edges:
- First-ever visit asks for **approve + session registration as 2
  popups before any bet** (`casino.tsx:549-551`, "register (2
  confirmations)"). This is the single biggest time-to-first-bet
  leak: the industry standard is fund → bet in one gesture. At
  minimum the copy must say what happens and why, and registration
  should be bundled into the first bet attempt, not a separate click.
- Wager input is a bare text field with no quick amounts (½, 2x,
  max, presets), no min/max display, no per-game limits shown before
  the bet (`casino.tsx:532`). Leaders show min/max on the game page
  and quick-stake chips inside it.
- The fullscreen bet animation blocks the screen and takes over
  (`bet-animation.tsx`). It is now honest (bit-path replay, 32abcec),
  but as a takeover on *every* bet it slows re-betting — the metric
  leaders optimize hardest ("re-bet speed after settlement"). A
  speed mode / skip / inline mini-animation is needed.

### 3.3 Trust & provably fair — HALF BUILT
Strengths: on-chain settlement with full tx hashes, bet history
persisted and chain-verified (`/api/bets`), the new Plinko verify
line (path + word + popcount). Missing:
- **No per-bet verification page.** Leaders let you recompute any
  round from a committed seed. ZSKazik has all the data (gameBetId,
  place/resolve blocks, prevrandao) but no UI that does it. This is
  the cheapest trust win available — the Plinko derivation code
  (`lib/plinko-path.ts`) already proves it works.
- **No RTP anywhere.** Dice/flip show "2% edge" in muted text
  (`casino.tsx:545-547`); Plinko shows "up to 16x". Leaders put RTP
  on the game card and in the info panel. For Plinko, expected value
  per bin/row count should be one tap away.
- **No live proof.** No live bet feed, no big-wins feed, no total
  wagered/paid stats. Roobet's Live RTP board and Stake's per-game
  player counts are the most-copied trust features in the industry.
- Testnet caveat is honest ("testnet randomness — mainnet needs
  VRF", `casino.tsx:511`) but there is no plain-language fairness
  explainer: what prevrandao is, why it's biasable at size, what VRF
  changes. Players can't distinguish "testnet demo" from "rigged".

### 3.4 Money flow — INVISIBLE
Today: no deposit/withdraw UI at all. ZSK acquisition is off-platform
(user must obtain testnet ZSK somehow — in practice the operator
funds wallets out-of-band, which is what has been happening with the
burner). Leaders put withdraw beside deposit, show fees (Rollbit:
zero operator fees), and process crypto in minutes. For a token
casino, the wallet *is* the cashier, but it still needs: how to get
ZSK (faucet/buy/swap entry point), balance always visible, and a
withdraw/transfer action that doesn't require leaving the game.

### 3.5 Retention — NONE
No VIP, no rakeback, no races, no bonuses, no loyalty, no
achievements, no leaderboard (`/api/leaderboard` exists as a stub
route but is not surfaced in the UI). This is the largest commercial
gap. You cannot out-acquire churn; every leader's moat is the wager
ladder. Note the Rollbit lesson: rewards with **no wagering** are
both the most-loved and the most trusted — a ZSK-native rakeback
(paid in ZSK from Treasury margin) is trivially implementable on the
existing token/Treasury plumbing.

### 3.6 Social proof & community — NONE
No live bets, no chat, no Discord/Telegram presence, no share
mechanism. Crypto casinos treat community as a channel (BC.Game,
Rollbit run Discord events as retention). Even without chat, a live
recent-bets ticker and a leaderboard cost little: the bet log is
already persisted (`lib/store`).

### 3.7 Mobile — FRAGILE
Single-column layout works, but: primary actions are not thumb-zone
optimised, the fullscreen animation modal is the whole mobile
experience, there is no bottom nav (Lobby / Wallet / History /
Profile pattern), and the 560px canvas board is desktop-sized. Leaders'
mobile parity is a release blocker, not a nice-to-have — most crypto
casino traffic is mobile. Stake's mobile redesign lesson also
applies: burying Live Casino two taps deep measurably annoyed
players; keep the 3 games one tap from anywhere.

### 3.8 Responsible gambling — ABSENT
No deposit/loss limits, no session timer, no reality check, no
self-exclusion, no cool-off, no 18+ / "play only with what you can
afford to lose" messaging. BC.Game puts session timers in the header;
Rollbit's Exclusion tab is two clicks from anywhere; the literature
is explicit that normalized framing ("account controls", like
banking spend limits) gets adoption where "intervention tool"
framing gets avoidance. On a testnet demo this is not yet a legal
requirement, but building it now — as wallet-level controls — is
cheap and is the difference between "crypto toy" and "operator that
could be licensed".

### 3.9 Performance & accessibility — UNMEASURED
No performance budget stated; the page ships 611 kB / 699 kB first
load JS (Next build output). Industry bars: LCP < 2.5s, page load
< 3s, bounce < 40%. No keyboard/focus support on the bet controls,
no reduced-motion respect (the animation is intense), muted text
contrast is borderline. Each is small; collectively they are the
"75% judge credibility by design alone" effect.

### 3.10 Support — NONE
No help centre, no FAQ, no live chat, no status page. The revert
humanizer (`lib/revert`) is a good start — errors are named — but
there is no path from "my bet is stuck" to a human. Escrowed bets
are hidden from history (`casino.tsx:565`), which reads as money
vanishing; a visible "pending / resolving" state with a refresh
action is the industry norm.

---

## 4. Prioritized roadmap

### P0 — Make the first bet instant and the result provable (2–3 weeks)
1. **Lobby as the home screen.** Game cards with art, title, RTP and
   one-line payoff ("Dice — roll over, up to 19.6x, 98% RTP"), category
   nav (Originals / All), search, recently-played row (localStorage,
   cross-device later). Tabs become routes under the lobby. Effort: M.
2. **Fix first-bet friction.** Bundle registration into the first bet
   click; replace "register (2 confirmations)" with plain copy ("We
   need 2 wallet confirmations once — after that, 0 popups for 30
   days"). Show min/max wager + quick chips (10/50/100/½/2x/max) per
   game. Effort: S.
3. **Per-bet verify page.** `/verify/:gameBetId` recomputing the word
   from chain data (Plinko first — the code exists; Dice/Flip are
   the same pattern), showing inputs, tx hashes, and the result.
   Effort: S–M. This is your provably-fair story, for free.
4. **Live proof strip.** Recent bets ticker (from the existing bet
   log) + today's totals (wagered/paid/players) in the lobby header.
   Effort: S.
5. **Re-bet speed.** Animation "instant/skip" toggle, result banner
   instead of full takeover for repeat bets, sticky wager/controls
   so the next bet is one click. Measure bets/session. Effort: M.

### P1 — Retention and money (4–6 weeks)
6. **ZSK wallet panel.** Balance always visible; get-ZSK entry point
   (faucet/testnet flow made explicit); transfer/withdraw in-app;
   fee displayed (zero). Effort: M.
7. **Rakeback + VIP ladder.** Wager-based tiers paid in ZSK from
   Treasury margin, no wagering on rewards (the Rollbit lesson),
   claimable in one click, progress bar on the profile. Start with
   3 tiers. Effort: M–L (needs Treasury/reward contract work).
8. **Daily race + leaderboard.** Wagered-volume race, prize pool in
   ZSK, countdown timer, `/api/leaderboard` already exists — surface
   it. Effort: M.
9. **Mobile pass.** Bottom nav (Games / Wallet / History / More),
   thumb-zone bet controls, canvas board scales to viewport, test on
   real devices. Effort: M.
10. **Game depth.** The Originals catalog is the moat: Mines, Crash,
    Limbo, Wheel are the highest-ROI additions (simple contracts,
    reuse GameBase + the bit-path animator pattern). Each new
    Original is a lobby card, a verify page, and a race-eligible
    category for free. Effort: L each.

### P2 — Trust-grade and polish (ongoing)
11. **Responsible-play suite.** Deposit/loss limits, session timer in
    header, reality check, self-exclusion (24h → 6mo), framed as
    "account controls". Store limits on-chain or server-side per
    wallet. Effort: M.
12. **Fairness explainer + RTP panels.** One page: how randomness
    works per game, what prevrandao bias means, the VRF plan, RTP
    tables per game/row count. Effort: S (writing + data you have).
13. **Support surface.** Help centre (bet stuck, wallet on wrong
    chain, how verify works), visible pending-bet state with retry,
    status line for RPC health. Effort: M.
14. **Performance budget.** LCP < 2.5s, route-level code splitting
    (the 699 kB first load is heavy), `prefers-reduced-motion`
    animation path, keyboard-navigable controls, contrast pass.
    Effort: M.
15. **Community.** Discord/Telegram links, share-bet deep links,
    big-win feed. Effort: S.

---

## 5. What NOT to copy

- **Slot libraries / third-party providers.** Stake's 5,000 games are
  a content moat you cannot buy; your moat is on-chain provability.
  Copying the *shape* of the lobby is right; licensing slots is not.
- **Deposit-match bonuses with 30–40x wagering.** The most-complained
  mechanic in every review. If you do bonuses, do no-wagering
  rakeback.
- **Streamer/celebrity marketing.** Roobet/Stake's most criticized
  surface; also the first thing regulators target.
- **Dark-pattern retention.** Hidden timers, disguised opt-ins,
  loss-chasing prompts. The literature is consistent: they lift
  week-1 handle and destroy LTV and license prospects.
- **Fake liveness.** Fake player counts, fake "X people are playing"
  — your bet log is real; show the real numbers, even when small.
  Real 12 players beat fake 12,000, and chain-verifiable is your
  whole brand.

---

## 6. KPIs to instrument (from the industry playbook)

Track these from the day P0 ships; they are what the leaders optimize:

| KPI | What it reveals | Healthy direction |
|---|---|---|
| Time-to-first-bet | Confidence formation after entry | Down (target < 60s) |
| Bets per session | Momentum after settlement | Up |
| Re-bet speed after settlement | Animation/settlement friction | Down |
| D1/D7/D30 retention, sessions/user | Habit formation | Up |
| Withdrawal abandonment | Trust at cash-out | Down |
| Settlement disputes / support contacts per 1k bets | Clarity of outcomes | Down |
| Repeated balance checks | Player uncertainty | Down |
| LCP / bounce | First-viewport quality | < 2.5s / < 40% |

---

## 7. The one-paragraph version for the roadmap

Ship the lobby, the verify page, and the live ticker first — they are
cheap, they are the trust story your on-chain architecture is
uniquely able to tell, and they fix time-to-first-bet. Then the
wallet panel and rakeback ladder, because retention is the business.
Then games (Mines/Crash/Limbo) and the responsible-play suite.
Everything else is polish. ZSKazik's unfair advantages — 0-popup
betting, on-chain settlement, bit-path provability — are exactly
what the leaders fake with committed seeds. Lean into them; add the
commercial machinery around them.

---

## 8. Licensing & compliance note (read before real money)

This report covers UI/UX only. A real-money casino needs a gambling
licence (jurisdiction-dependent: Curaçao/Anjouan are the common
crypto-casino routes), KYC/AML (risk-based, per Rollbit's model),
geo-blocking, and the responsible-play tooling in P2 becomes a legal
requirement, not a feature. Testnet/demo operation avoids most of
this today; the P2 items should be built before any mainnet launch
regardless, because retrofitting limits and exclusion after players
exist is how operators get into trouble.

---

## Sources

- CryptoSlate — Stake Casino Review 2026 (lobby structure, VIP, support response times)
- CryptoSlate — Winna / Roobet / BC.Game reviews (rakeback cadence, VIP ladders, Live RTP board)
- ProvenlyFair — Stake Alternatives 2026 (deposit volumes, KYC norms, provably-fair Originals)
- GetABonus — Rollbit Review 2026 (cashier design, no-wagering rewards, responsible-gambling tooling, AML model)
- iGaming Today — BC.Game Review (responsible gambling tool list)
- Altenar — UI/UX tricks to drive player engagement (time-to-first-bet, trust KPIs, feedback design)
- Sudonex — Casino Lobby Design Guide (Friedman/Thomas floor theory → online lobby, personalization ROI, normalized RG framing)
- Readability — UX design and interface readability (typography, scanning, onboarding checklists)
- eJaw — Designing a game lobby UX that converts without hype (intent filters, recently-played, confusion-free labeling)
- Sports Insight — Critical role of intuitive design (38% leave after one bad experience; 75% judge credibility by design)
- Stake mobile redesign analysis (algorithmic feed pitfalls, navigation depth costs)

# Monetization notes — web ads

Scratch analysis from 2026-08-11. **Not a plan, not a commitment** — a set of
numbers to argue with later. Nothing here is built, and nothing here should be
read as advice to build it.

The premise being explored: now that the game is meant for the open web rather
than a single room of people, what would ad revenue realistically look like at
each scale, and what would it cost to serve.

---

## 1. The formats

Ads pay per **impression**, not per player. What matters is minutes played and
how many ad slots those minutes support — player count only matters through that.

| Format             | Where it would go                                        | Gaming eCPM, mixed geo |
| ------------------ | -------------------------------------------------------- | ---------------------- |
| Display 300×250 / 728×90 | Around the canvas; menu and lobby screens           | $2–4                   |
| Interstitial video | Between rounds, on death, on respawn                     | $6–12                  |
| Rewarded video     | Opt-in — "watch for a paint palette / instant respawn"   | $15–25                 |
| Portal rev-share   | Nothing placed by us; the portal runs its own stack      | ~$1–4 per 1,000 gameplays |

Tier-1 traffic (US/UK/CA/AU/DE) is **3–5×** tier-3 (IN/BR/ID/PH). A game that
goes viral on a portal is usually tier-3 heavy — i.e. the traffic that pays worst.

Networks that would plausibly take a game this size: **AdinPlay**, **Venatus**,
**Playwire**, **GameMonetize**. AdSense works but is poor at games and will not
serve rewarded video. All of them require a privacy policy and a TCF-compliant
consent banner before they will serve anything.

Most networks will not onboard below **~50k monthly pageviews**, so at small
scale AdSense is the only option, at the low end of the eCPMs above.

---

## 2. Revenue model

### Assumptions (change these first when revisiting)

- Average session: **12 minutes**
- Sessions per player per day: **1.6** (≈19 min/day)
- Display impressions: **6 per session**
- Interstitials: **2 per session**
- Rewarded opt-in rate: **15%**, 1 offer per session
- **35% of impressions lost to ad blockers** — gaming audiences are the worst
  offenders, and this is the single most commonly omitted term
- Geo mix: blended, not tier-1 heavy

### Working

| Line          | Impressions / DAU / day | eCPM | Revenue / DAU / day |
| ------------- | ----------------------- | ---- | ------------------- |
| Display       | ~9.6                    | $3   | $0.029              |
| Interstitial  | ~3.2                    | $8   | $0.026              |
| Rewarded      | ~0.24                   | $18  | $0.004              |
| **Gross**     |                         |      | **~$0.059**         |
| After 35% adblock |                     |      | **~$0.038**         |

Call it **$0.03–$0.05 per daily active user per day**. That lands inside the
published benchmark range for ads-only web games ($0.01–$0.05 ARPDAU), which is
the main reason to trust it.

### By scale

Peak CCU ≈ DAU ÷ 15, for a game with ~19 min/day of play.

| Daily actives | ≈ Peak concurrent | Ad revenue / month | What that is           |
| ------------- | ----------------- | ------------------ | ---------------------- |
| 100           | ~2                | **$3–5**           | not money              |
| 1,000         | ~20               | **$30–50**         | pays the VPS           |
| 10,000        | ~200              | **$300–500**       | a side income          |
| 100,000       | ~2,000            | **$3k–5k**         | a part-time salary     |
| 1,000,000     | ~20,000           | **$30k–50k**       | a business, with staff costs |

**Halve every row** if the audience is rated under-13. COPPA means contextual
ads only, no personalization, and eCPMs drop 50–70%. Game portals skew young, so
this is the likely case rather than the edge case.

---

## 3. Bandwidth — the part specific to this game

This is where multiplayer diverges from a single-player web game, and it is the
number most estimates skip entirely.

The room patches at 20 Hz (`PATCH_MS = 50`, `server/room.ts`). A moving player
dirties x/y/z/yaw/pitch — roughly **30–35 bytes encoded per player per patch**.
Each client therefore downloads about `20 × (N−1) × 35` bytes/sec.

*(Estimated from the schema shape, not measured. Worth confirming against a real
capture before anyone spends money on it.)*

| Players in room | Down per client | Per player-hour |
| --------------- | --------------- | --------------- |
| 4               | ~2.1 KB/s       | ~7.5 MB         |
| 8               | ~4.9 KB/s       | ~18 MB          |
| 16              | ~10.5 KB/s      | ~38 MB          |

At 8-player rooms: **2,000 CCU ≈ 78 Mbps sustained ≈ 25 TB/month egress.**

### Host choice is worth more than any ad optimization

Egress at 25 TB/mo, against the $3–5k of ad revenue at that same scale:

| Host           | Egress cost | Effect                          |
| -------------- | ----------- | ------------------------------- |
| Hetzner / OVH  | ~$0 (included) | fine                         |
| DigitalOcean   | ~$250       | fine                            |
| AWS / GCP      | ~$2,250     | **eats half the revenue**       |

At 20,000 CCU it is ~250 TB/month: **~$22,500/mo on AWS** against $30–50k of ad
revenue, versus **~$1–2k on Hetzner**. Same game, same players — the host choice
alone is the difference between a ~60% margin and a ~15% one.

**Do not put a WebSocket game on hyperscaler egress.**

### CPU is not the constraint

Movement is client-simulated and the server only clamps it, so a single box
handles thousands of connections. Past ~2k CCU it needs multiple processes with
`@colyseus/redis-presence` and `@colyseus/redis-driver` — real work, but bounded,
and not the thing that decides the economics.

---

## 4. Distribution: portals, not self-publishing

**The bottleneck is traffic, not ad tech.** No web game has ever failed to
monetize because it picked the wrong network; they fail because forty people play
them. Portals — CrazyGames, Poki, itch — are where web-game traffic actually
lives. They take ~50% and in exchange bring the audience and own the ad stack,
consent, and payouts. CrazyGames accepts `.io`-style multiplayer where you run
your own game server: you eat the server cost, they handle everything above it.

Three things that bite multiplayer specifically on that path:

1. **Pointer lock in a cross-origin iframe.** The portal must set
   `allow="pointer-lock"` on the frame. Confirm before building against it — a
   hunter with no aim is not a game.
2. **Rewarded video needs a clean pause.** Suspend audio, release pointer lock,
   resume without a broken state. `Game.tsx` already owns exactly this teardown
   for the pause menu, so this is closer to done than most of it.
3. **COPPA.** See the halving note in §2.

---

## 5. What actually blocks this today

Ads are the last 10% of the problem. Nothing in the current build sustains a
session worth selling:

- No round flow, no win condition, no lobby or ready-up, no health.
- Matchmaking is `joinOrCreate("game")` against a host found by **UDP broadcast
  on the local subnet** — which does not exist on the internet. `LAN_DISCOVERY=0`
  and `PUBLIC_GAME_PORT` make one hosted server reachable, but there is no room
  browser, no region routing, and no way for two strangers to meet in a match.

Honest sequencing if this were ever pursued:

> rounds + win condition → matchmaking + room browser → get on a portal →
> *then* care about eCPMs

---

## Caveats

- Every eCPM here is a 2026 blended figure from public benchmarks, not a quote.
  Real rates come from a network onboarding call and vary by season (Q4 is
  ~1.5–2× Q1) and by geo mix more than by anything you control.
- The bandwidth figures are derived from the schema, not measured off the wire.
- Revenue per DAU is the least reliable number in the document: it swings 5× on
  geo mix alone.
- Nothing here accounts for the cost of *building* any of section 5.

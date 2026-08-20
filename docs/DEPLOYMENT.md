# Deployment Pipeline

A guide to deploying Super Chameleon to a VPS using Portainer and Cloudflare
Tunnel. **There is no registry in the loop** — Portainer builds the image on the
VPS from this repository, so GitHub is the only platform in the chain.

```
┌──────────────┐    1. git push    ┌─────────────────────────┐
│ Local Mac    │ ────────────────▶ │ GitHub                  │
└──────────────┘                   │ skeplys83/superchameleon│
                                   └─────────────────────────┘
                                               │
                                     2. Portainer polls (5m),
                                        pulls, and *builds*
                                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ VPS                                                                    │
│                                                                        │
│   ┌───────────────────────────┐      HTTP / WS       ┌──────────────┐  │
│   │ cloudflared (Tunnel)      │ ───────────────────▶ │ Game App     │  │
│   │ (Cloudflare Zero Trust)   │     localhost:3000   │ (Portainer)  │  │
│   └───────────────────────────┘                      └──────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
              ▲
   Encrypted  │ 3. Secure Ingress (HTTPS / WSS on 443)
   QUIC Tunnel│
              ▼
┌───────────────────────────┐
│ Cloudflare Edge           │ ◀─── DNS Nameservers from Porkbun
│ (superchameleon.io)       │
└───────────────────────────┘
              ▲
              │ HTTPS / WSS
              ▼
┌───────────────────────────┐
│ Player Browser            │
│ https://superchameleon.io │
└───────────────────────────┘
```

---

## 1. Deploying

**A push to `main` is the deploy.** There is no second step.

```bash
git push
```

Portainer's git poll (5 minutes) notices the new commit, pulls it, and runs
`docker compose pull` then `docker compose up -d`. To skip the wait, press
**Pull and redeploy** in the stack panel.

### What makes that work: `pull_policy: build`

Two problems, one line.

**`docker compose pull` runs first, and Portainer treats its failure as fatal.**
`superchameleon:app` exists in no registry, so the pull ends with *"pull access
denied for superchameleon, repository does not exist or may require 'docker
login'"* and the deploy stops before `up` is ever reached. Compose alone only
warns about this; Portainer escalates it. `pull_policy: build` tells compose the
image is never pulled, only built, so the pull step reports `Skipped`.

**`up` reuses an image it already has.** Compose builds a service only when no
local image by that name exists — so with a fixed tag it builds once and runs
that code for ever while git dutifully updates the checkout underneath. This is
how production came to serve a two-day-old map through several redeploys. The
paid escape hatches (**Re-pull image**, **Force redeployment**) just pass
`--build`. `pull_policy: build` does the same thing for free: every `up`
rebuilds, and BuildKit's layer cache keeps that honest — `npm ci` only reruns
when `package-lock.json` changes.

### If the build runs out of memory

The VPS now does the vite build itself, which the old Docker Hub flow avoided.
It needs roughly 1–2 GB. If a deploy dies with `Killed` or exit code 137, add
swap rather than shrinking the build:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

### Housekeeping

Every deploy rebuilds under the same tag, which leaves the previous image
**untagged** rather than deleting it. Untagged images are invisible to a plain
`docker images`, so they accumulate quietly — about 17 MB a deploy, since the
base and `node_modules` layers are shared.

Sweeping them is one safe command. It only removes untagged images, so nothing
tagged and nothing running can be caught by it:

```bash
docker image prune -f
```

If you would rather be explicit about which project you are clearing, the
`Dockerfile` sets `LABEL app=superchameleon` for exactly that:

```bash
docker image prune -af --filter "label=app=superchameleon"
```

`-a` there also takes the *current* image if no container is using it, so run it
while the stack is up. Neither command touches cloudflared or anything else on
the host.

The **build cache** is separate, untouched by both, and usually the bigger
consumer on a machine that builds:

```bash
docker builder prune --filter "until=336h"
```

There is no rollback image to preserve: every `up` rebuilds from the checkout,
so **rolling back is a `git revert`** and a minute of build.

---

## 2. Cloudflare: Domain & Tunnel Setup

1. **Porkbun DNS:** Set authoritative nameservers to Cloudflare (`aria.ns.cloudflare.com`, etc.).
2. **Cloudflare Zero Trust:**
   * Go to **Networks** ➔ **Tunnels** ➔ **Add Tunnel** (`cloudflared`).
   * Copy the tunnel run token: `eyJhbGciOi...`
3. **Public Hostname Route:**
   * **Domain:** `superchameleon.io`
   * **Service:** `HTTP` ➔ `localhost:3000` (or `http://SuperChameleon:3000`)
4. **Cloudflare SSL & WebSockets:**
   * **SSL/TLS Mode:** `Flexible` or `Full`.
   * **Always Use HTTPS:** `ON`.
   * **Network ➔ WebSockets:** `ON`.

---

## 3. Portainer on VPS: Stack Deployments

### Stack A: Game Server (`superchameleon`)

In Portainer ➔ **Stacks** ➔ **Add stack**:

This stack is deployed **from the git repository**, not pasted in: point
Portainer at `https://github.com/skeplys83/superchameleon`, compose path
`docker-compose.yml`, and turn GitOps polling on. The file it uses is the one in
this repo:

```yaml
services:
  meccha:
    build:
      context: .
    image: superchameleon:<sha>      # bumped by `npm run release`
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      SESSION_NAME: "Meccha Chameleon"
      PUBLIC_GAME_PORT: "${PUBLIC_GAME_PORT:-3000}"
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

`PUBLIC_GAME_PORT` stays at 3000: the client reads that value as "no explicit
port" and connects on 443, which is what the tunnel serves. See the
normalisation in `client/net/client.ts`.

### Stack B: Cloudflare Tunnel (`cloudflared`)

In Portainer ➔ **Stacks** ➔ **Add stack**:

```yaml
version: "3.8"

services:
  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token <PASTE_TUNNEL_TOKEN_HERE>
```

---

## 4. How Traffic Flows

1. **Page Load:** Browser requests `https://superchameleon.io`. Cloudflare terminates SSL and routes the request over the encrypted tunnel to `cloudflared` on the VPS, which proxies to `http://localhost:3000`.
2. **Matchmaking & WebSocket:** Client queries `/api/sessions` and opens a WebSocket to `wss://superchameleon.io` (port 443). Cloudflare upgrades the connection to WebSocket and tunnels traffic directly into the Colyseus game server on port 3000.

---

## 5. GameDistribution

**Nothing about the game is uploaded to them.** Their developer guidelines
refuse external hosting *"except for Real Multiplayer games"* — which this is,
so superchameleon.io stays the only place the game runs, and the deploy above is
still the whole deploy.

What is uploaded is `gamedistribution/index.html`, on its own, zipped: a wrapper
page whose iframe points at the live site and passes the publisher's URL through
as `gd_sdk_referrer_url`. The SDK inside the frame reads that itself. Without it
every impression is attributed to nobody.

It does not change when the game changes, so it is uploaded once and forgotten.
The two things that would make it stale are the domain moving and
GameDistribution changing the parameter.

**The ad SDK is `src/client/app/gamedistribution.ts`** and is inert until
`GAME_ID` is filled in from their control panel. Their activation step needs a
pre-roll watched all the way through from inside their own iframe preview
before the integration is approved.

### What has to be filled in

| what | where |
| --- | --- |
| `GAME_ID` — the 32-character hash from their control panel | `src/client/app/gamedistribution.ts` |
| `GAME_URL` — where the game actually runs | `gamedistribution/index.html` |

Nothing else is configurable and there are no environment variables: the SDK
loads itself and reads `gd_sdk_referrer_url` off the frame's own query string.

### The one thing that could break their embed

**A hunter is first person and the camera is the mouse.** Pointer lock in a
cross-origin frame needs `allow="pointer-lock"`, which our wrapper grants to the
game — but the wrapper is itself inside *their* publisher's frame, and that one
is theirs. If a publisher embeds without it, chameleons play fine and hunters
cannot look around. Worth asking them before submitting, because it is not
something a code change here can fix.

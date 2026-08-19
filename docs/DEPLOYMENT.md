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

Nothing to do — the stack cleans up after itself. The `prune` service in
`docker-compose.yml` runs once per deploy and removes every `superchameleon`
image no container is using, so only the running release is ever on disk.

Three things make that safe to leave unattended:

- **It waits for `service_healthy`.** A build that comes up broken keeps the
  previous image, so there is still something to roll back to.
- **It only ever names images carrying `LABEL app=superchameleon`** (set in the
  `Dockerfile`). It is not `docker image prune -a`, so nothing else on the host
  — cloudflared included — can be caught by it.
- **`docker image rm` refuses an image a container is using.** The live release
  is protected by docker itself, not by the filter being right.

There is no rollback image to keep, by design: every `up` rebuilds from the
checkout, so **rolling back means reverting the commit** and letting the next
deploy build it. That is a `git revert` and a minute of build. If you would
rather keep images around anyway, delete the `prune` service and sweep by hand
instead:

```bash
docker image prune -a --filter "label=app=superchameleon" --filter "until=336h"
```

The **build cache** is separate and is not touched by any of this. It is
usually the bigger consumer on a build host:

```bash
docker builder prune --filter "until=336h"
```

### If the build runs out of memory

The VPS now does the vite build itself, which the old Docker Hub flow avoided.
It needs roughly 1–2 GB. If a deploy dies with `Killed` or exit code 137, add
swap rather than shrinking the build:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

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

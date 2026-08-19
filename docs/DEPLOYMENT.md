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

## 1. Releasing (the mandatory post-push step)

**Bumping the image tag in `docker-compose.yml` is the deploy.** Nothing else
triggers one.

```bash
npm run release                              # stamps image: superchameleon:<sha>
git commit -am "Release $(git rev-parse --short HEAD)"
git push
```

Portainer's git poll (5 minutes) sees the changed compose file, pulls it, finds
it has no local image by that name, and **builds one**. Then it recreates the
container. To skip the wait, press **Pull and redeploy** in the stack panel.

### Why a tag, and not just "redeploy"

`docker compose up` builds a service **only when no local image by that name
exists**. A fixed tag — or no `image:` line at all — means the image is built
once and reused for ever: git updates, the container restarts, and the code
inside it never changes. That is exactly the failure this repo hit, where the
production server served a two-day-old map after several redeploys.

The switches that would force it anyway — Portainer's **Re-pull image** and
**Force redeployment** — are Business Edition features. The tag bump costs
nothing and needs no edition.

The stamp lands one commit "behind" itself: you stamp at HEAD, then commit. That
is correct rather than sloppy — `docker-compose.yml` is in `.dockerignore`, so
the stamping commit changes nothing the build can see, and the image tagged
`<sha>` really does hold that commit's code.

### Housekeeping

Every release leaves the previous image on the VPS. They are cheap but not free:

```bash
docker image prune -a --filter "until=336h"   # drop unused images over 2 weeks old
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

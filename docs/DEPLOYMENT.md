# Deployment Pipeline

A guide to building, pushing, and deploying Super Chameleon to a multi-tenant VPS using Docker Hub, Portainer, and Cloudflare Tunnel.

```
┌──────────────┐         1. Push Image         ┌─────────────────────────┐
│ Local Mac    │ ────────────────────────────▶ │ Docker Hub              │
│ (Build Host) │                               │ skplys83/superchameleon │
└──────────────┘                               └─────────────────────────┘
                                                            │
                                                     2. Pull│Image
                                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Friend's VPS                                                           │
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

## 1. Local Machine: Build & Push to Docker Hub

Because the build host is typically macOS and the target VPS is Linux `x86_64`, build for `linux/amd64` to prevent OOM on low-memory VPS instances.

```bash
# 1. Login to Docker Hub
docker login

# 2. Build multi-arch image
docker build --platform linux/amd64 -t skplys83/superchameleon:latest .

# 3. Push image
docker push skplys83/superchameleon:latest
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

```yaml
version: "3.8"

services:
  meccha:
    image: skplys83/superchameleon:latest
    container_name: SuperChameleon
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      SESSION_NAME: "Super Chameleon"
      PUBLIC_GAME_PORT: "443" # Directs clients to secure wss:// on 443
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

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

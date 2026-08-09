# LAN multiplayer plan

Goal: several people on the same Wi-Fi open a URL, pick hider or seeker, and see
each other move in one shared room. No internet, no accounts, no Vercel.

## Why the current Vercel-shaped setup doesn't apply

Vercel Functions do support WebSockets now, but a LAN-only game shouldn't
round-trip through the internet — the latency and the offline requirement both
argue against it. Run the whole thing off one machine on the LAN. Keep the
Next.js app, drop the assumption that it deploys to Vercel.

## Topology: host-authoritative, one player is the server

One machine runs `next dev` (or `next start`) **and** a WebSocket server in the
same process. Everyone else opens `http://<host-lan-ip>:3000`. That machine is
the referee: it owns the true position of every player.

Chosen over peer-to-peer (WebRTC needs signalling and mesh state gets
inconsistent fast) and over a dedicated server binary (another thing to install
and launch).

The host is a normal player; their browser talks to the local server over
`ws://localhost` and has no privileged client code.

## Transport

Node's `ws` in a custom server that also serves Next:

```
server.mjs            # http server: Next request handler + ws.Server upgrade
  /_ws                # websocket endpoint
```

Run with `node server.mjs`. Binding to `0.0.0.0` is what makes it reachable from
other devices; `next dev` already prints the LAN URL.

Prefer this to Next's `experimental_upgradeWebSocket()` — that is designed for
Vercel Functions, and a plain `ws` server is easier to reason about locally.

## Authority model

Full server authority is not worth it at this scale. Use **client-authoritative
position with server validation**, which is fine for a friends-on-a-couch game:

- Client simulates its own Rapier body exactly as it does today.
- Client sends its transform at a fixed 20 Hz (not per frame).
- Server clamps obvious nonsense (outside the room, moved further than
  `SPEED * dt * 1.5` since the last tick) and rebroadcasts.
- Server owns the things players must not lie about: role assignment, hit
  registration, round state.

Revisit only if someone actually cheats.

## Messages

Small JSON, one `t` field for type. Binary is premature here.

Client to server:
- `join` `{ role }` — server replies with an assigned `id`
- `state` `{ p: [x,y,z], yaw, flat }` at 20 Hz
- `shoot` `{ origin, dir }` — never "I hit player X"

Server to client:
- `welcome` `{ id, players }`
- `players` `{ [id]: { role, p, yaw, flat } }` broadcast at 20 Hz
- `spawn` / `despawn` `{ id }`
- `mark` `{ id, position, rotation }` so every client sees the yellow patch
- `hit` `{ shooterId, targetId }`

Shooting resolves on the server: it raycasts against the last known player boxes
so a client cannot claim a kill. The yellow mark is cosmetic and can be trusted.

## Client changes

The single-player code is already shaped for this. What changes:

1. **Split `Player` into `LocalPlayer` and `RemotePlayer`.** `LocalPlayer` keeps
   the current input, physics and camera code plus a network send. `RemotePlayer`
   is a mesh with no physics body and no input — a kinematic body at most.
2. **`RemotePlayer` interpolation.** Buffer the last two `players` snapshots and
   lerp position, slerp yaw, ~100 ms behind. Without this, 20 Hz looks like a
   slideshow.
3. **Lift shared state out of `Scene`.** `marks` moves to a network store; a
   `players` record joins it. This is the point to bring `zustand` back.
4. **`useSocket` hook** owning the connection, reconnect, and a send queue.
5. **Lobby.** The role menu becomes a lobby: name field, role choice, player
   list, host presses start. The `RoleMenu` component is the seed of this.

## Rough sequence

1. `server.mjs` serving Next over the LAN, verified from a phone.
2. Echo websocket, connection count rendered on screen. Proves the network path
   before any game logic depends on it.
3. Broadcast transforms, render other players as static boxes.
4. Add interpolation.
5. Server-side shooting and hit registration.
6. Lobby and round flow (seekers frozen while hiders hide, timer, win state).

Each step is independently playable, which matters because LAN bugs are much
easier to isolate when only one thing changed.

## Things that will bite

- **Firewall.** macOS prompts to allow incoming connections the first time; if
  nobody can connect, this is almost always why.
- **HTTPS.** Pointer lock works on `http://` for LAN IPs in Chrome, but Safari
  is stricter. If iOS clients matter, plan for a self-signed cert.
- **Host advantage.** The host has ~0 ms latency. Fine here; worth knowing.
- **Tab visibility.** Backgrounded tabs stop `requestAnimationFrame`, so a
  player who alts away stops sending state. Send a heartbeat on a `setInterval`
  (timers keep firing, throttled) rather than from `useFrame`, and mark players
  stale after ~2 s.

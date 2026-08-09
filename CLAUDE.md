@AGENTS.md

# Meccha Chameleon

A LAN-only multiplayer hide-and-seek game. Hiders are stick figures who can lie
on their side to pass as scenery; seekers hunt them in first person with a
shotgun. No internet, no accounts, **not deployed to Vercel** — everything runs
on machines on the same Wi-Fi.

> **Keep this file current.** It is the only thing a fresh session reads before
> touching the code. Whenever you change the stack, the controls, the network
> protocol, the room layout, or add a mechanic, update the matching section here
> in the same change. A stale CLAUDE.md is worse than none — the next session
> will trust it.

## Run it

```bash
npm run dev     # node server.mjs — Next on :3000, Colyseus on :2567
npm run build   # next build
npm start       # same server, NODE_ENV=production
```

`npm run dev` does **not** run `next dev`. It runs the custom server, which
prints the localhost URL, the LAN URL, and the Colyseus port. Other players open
the LAN URL.

Useful env vars: `PORT` (web, default 3000), `GAME_PORT` (Colyseus, default
2567), `SESSION_NAME` (overrides the auto-generated session title).

## Stack

- Next.js 16.3 App Router, React 19, TypeScript, Tailwind v4, Turbopack
- three.js + `@react-three/fiber` + `@react-three/drei`
- `@react-three/rapier` for physics
- **Colyseus 0.16** server + `colyseus.js` 0.16 client, `@colyseus/schema` v3

### Version constraint — do not "upgrade" Colyseus casually

`colyseus@latest` is 0.17 (schema v4) but the browser client `colyseus.js` only
goes up to 0.16 (schema v3). Mixing them is a protocol mismatch and npm refuses
to resolve it. The whole stack is deliberately pinned to the 0.16 / schema-3
line. Bump all three together or not at all.

## Layout

```
server.mjs                      Next handler + Colyseus + UDP LAN discovery
src/app/page.tsx                renders <Game />
src/components/game/
  Game.tsx                      top-level state: role, session, paused, error
  RoleMenu.tsx                  name input, role buttons, LAN session list
  PauseMenu.tsx                 resume / leave
  ControlsPanel.tsx             key legend, varies by role
  PlayerList.tsx                who else is connected
  Scene.tsx                     Canvas, lights, Physics, mark lifetimes
  Room.tsx                      arena shell + obstacles; exports ROOM_SURFACE
  Player.tsx                    local player: input, physics, camera, net send
  RemotePlayers.tsx             everyone else, interpolated
  StickFigure.tsx               the white figure (half-height 1, scaled by role)
  Shotgun.tsx                   shared gun prop
  Viewmodel.tsx                 seeker's first-person gun, rides the camera
  Marks.tsx                     yellow shot patches
  controls.ts                   keyboard map
  types.ts                      Role, BODY half-extents, Mark
src/lib/net.ts                  Colyseus client, remotes map, session discovery
src/lib/pointerLock.ts          shared canvas handle for pointer lock
```

## Roles and controls

| | Hider | Seeker |
|---|---|---|
| Camera | third person, orbit | first person |
| Size | half-extents `[0.4, 1, 0.4]` | `[0.52, 1.3, 0.52]` |
| Lie flat | yes (`1` upright / `2` on side) | no, always upright |
| Weapon | none | shotgun, left click |

Shared: `WASD` move (relative to camera), mouse look, `Q`/`E` turn the figure,
`Space` jump. Click the canvas to lock the cursor; Esc releases it.

Both roles render as the **same white stick figure** — only size and the gun
distinguish them. This is intentional (asked for explicitly). There is no
red/blue tint any more.

## Mechanics worth knowing

- **Lying flat is a roll, not a resize.** The figure keeps one set of
  half-extents and rotates `±π/2` about local Z inside its facing yaw. The
  rigid body has rotations frozen, so the same quaternion is applied to the
  visual group *and* the collider via `setRotationWrtParent`.
- **Seekers broadcast camera yaw, not body yaw**, so hiders can read where a
  seeker is looking. `pitch` is broadcast too and tilts the remote gun. Hiders
  broadcast their Q/E body yaw and `pitch: 0`.
- **Shooting** raycasts from screen centre against meshes named `ROOM_SURFACE`,
  and sends the hit point to the server. The server relays a `mark` to
  everyone including the shooter, so all clients see the same patch. Marks
  disappear after 3s. Shots do not hit players yet — there is no damage,
  scoring, or win condition.
- **Camera never leaves the arena**: the third-person camera raycasts toward its
  desired position and pulls in to `hit.distance - 0.35`, floored at 1.4.
- **Jump** is a naive grounded check (`|velocity.y| < 0.05`). It lets you jump
  off a wall you are sliding down. Replace with a proper ray/sensor when it
  matters.

## Arena

40×40, 12 high, white. Eleven fixed obstacles: four corner pillars, jumpable
crates, a divider wall, a tall slab. Every surface is named `ROOM_SURFACE` —
that name is what shots and camera collision filter on, so **new geometry must
carry it** to behave correctly.

`ROOM_HALF` in `Room.tsx` and `ROOM_LIMIT` in `server.mjs` describe the same
bound and must be changed together (currently 20 and 19).

## Networking

Host-authoritative-ish: every machine runs the full app; whoever you join is
the host for that session. Movement is client-simulated and the server clamps
it — this is a friends-on-a-couch game, not an anti-cheat problem.

**Discovery.** A browser cannot scan a LAN, so the *server* does it: each
instance broadcasts `{id, name, port, gamePort}` over UDP on port 41234 every
second and tracks peers with a 4s TTL. The page asks its own server via
`GET /api/sessions`, which returns `{self, sessions}`. The menu polls that every
2s. Session name defaults to the OS username, then becomes `"<name>'s Session"`
once someone joins.

**Room state.** One Colyseus room, `"game"`, `MapSchema<Player>` of
`{name, role, x, y, z, yaw, pitch, flat}`, patched at 20 Hz. Messages:
`state` (client→server), `shoot` (client→server), `mark` (server→all).

**Client.** `net.ts` keeps remote transforms in a plain `Map` **outside React**
and mutates them in place; React only re-renders when the roster changes.
Re-rendering the tree 20×/second is what makes naive multiplayer stutter.
`RemotePlayers` damp-lerps position and slerps rotation toward those targets.

Local state is sent on a **50 ms `setInterval`, not from `useFrame`** — a
backgrounded tab stops running frames, which would look like that player
freezing in place.

## Traps already hit — do not reintroduce

1. **`reactStrictMode: false` in `next.config.ts` is load-bearing.** R3F's
   `Canvas` does not survive StrictMode's dev-only double mount: the discarded
   mount calls `forceContextLoss()` and the canvas stays dead. Symptom is a
   black screen and `THREE.WebGLRenderer: Context Lost.`
2. **Never let a WebSocket server own the HTTP server's `upgrade` event.**
   `new WebSocketServer({ server, path })` destroys every non-matching upgrade,
   including Next's dev HMR socket, which stops the client bootstrap so **React
   never hydrates and no button works**. Colyseus is on its own port precisely
   to avoid this. Symptom is "connection refused" plus a completely dead UI.
3. **No CDN assets.** `<Environment preset="city" />` fetches an HDR at runtime
   and, under one `Suspense`, blanks the whole scene. Lighting is plain lights.
   Name labels use drei `Html`, not `Text` (troika fetches a font).
4. **Nothing here deploys to Vercel.** Ignore Vercel-shaped advice; a LAN game
   should not round-trip the internet.

## Verifying changes

`npx tsc --noEmit` and `npx eslint .` are the fast gates; `npm run build` before
calling anything done.

**The agent's browser tab reports `visibilityState: "hidden"`,** so Chrome never
runs `requestAnimationFrame` and **r3f never draws a frame**. Screenshots come
back black and the canvas may report 300×150. This is a harness limitation, not
a bug — do not go hunting for it again. What *can* be checked from the browser:
hydration, DOM/HUD text, console errors, WebGL context health, and click flows.

Anything visual — figure proportions, camera feel, gun placement, obstacle
layout — **must be confirmed by the user**. Say so plainly instead of implying
it was seen.

Networking is testable headlessly and should be: drive two `colyseus.js`
clients from a scratch `.mjs` script in the project root (so `node_modules`
resolves) against a running server, assert what each sees, then delete it.

## Not built yet

Hit registration, health/elimination, round flow (hide phase, timer, win
condition), a lobby with ready-up, and any sound. `MULTIPLAYER_PLAN.md` is the
original design note and is **out of date** — it describes a hand-rolled `ws`
protocol that Colyseus replaced.

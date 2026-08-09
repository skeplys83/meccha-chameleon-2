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
  palette.ts                    PAINT presets — swatch row *and* arena colours
  Player.tsx                    local player: input, physics, camera, paint, net send
  RemotePlayers.tsx             everyone else, interpolated
  StickFigure.tsx               the jointed figure (half-height 1, scaled by role)
  poses.ts                      the eight poses as joint angles
  PaintPanel.tsx                colour wheel, brightness, brush size, clear
  Shotgun.tsx                   shared gun prop
  Viewmodel.tsx                 seeker's first-person arms + gun, rides the camera
  Marks.tsx                     yellow shot patches
  controls.ts                   keyboard map
  types.ts                      Role, BODY half-extents, Mark
src/lib/net.ts                  Colyseus client, remotes map, session discovery
src/lib/skin.ts                 per-player paint canvases, stroke encode/decode
src/lib/pointerLock.ts          shared canvas handle for pointer lock
```

## Roles and controls

**The two roles do not share a control scheme.** Only `WASD` and `Space` mean
the same thing to both; everything else belongs to one role, and adding a
control means deciding whose it is.

| | Hider | Seeker |
|---|---|---|
| Camera | third person, orbit | first person |
| Size | half-extents `[0.26, 1, 0.26]` | `[0.52, 1.3, 0.52]` |
| Look | right-drag (cursor stays free) | mouse (pointer locked) |
| Turn the figure | `Q`/`E`, independent of the camera | none — the figure faces the aim |
| Poses | `1`–`5` | none, always upright |
| Zoom | scroll | none |
| Paint | left-drag on your body | pin the palette, drops to third person |
| Weapon | none | shotgun, left click |

`ControlsPanel` holds one legend per role and they are not built from a shared
base. If a row is on a card, that role must really have it wired up in
`Player.tsx` — those two files are the contract.

`1`–`5` map to `POSES` in `poses.ts`, in order: stand, crumple, lie on your
side, arms up, sit. **Index 0 is the upright stance** and is what everyone
spawns in. A seeker never leaves it, so a rolled first-person camera is not a
case that exists.

**A hider's collider is narrower than their figure** (`0.26` is the head radius
from `PART_SHAPE`), so shoulders and outflung arms sink into a wall while the
head, torso and legs stay out of it — a hider can actually press against a
surface instead of hovering a body's width off every one. The half-height is
untouched, so the feet still land exactly on the floor. Two consequences: a
folded pose's collider height is the `LOW_HALF` constant in `poses.ts` and not
`hx` (which would have squashed the crouch along with the width), and
`ROOM_LIMIT` in `server.mjs` had to go to 19.9, because clamping a legitimately
wall-hugging hider to 19 showed everyone else a body floating off the wall.

**Only the seeker takes the pointer lock.** A hider keeps their cursor — so
the paint panel is always reachable — and looks around by dragging. That also
means a hider never loses a lock, so their Esc is read as a keydown in
`Game.tsx`; the seeker's Esc still arrives as a pointer-lock change.

Jump is a **velocity, not an impulse**: the seeker's collider is bigger and so
heavier, and an impulse gave the two roles different jump heights. Horizontal
movement was already velocity-driven and identical for both.

Both roles render as the **same white stick figure** — only size and the gun
distinguish them. This is intentional (asked for explicitly). There is no
red/blue tint any more.

## Mechanics worth knowing

- **Poses are joint angles on a rig, not separate models.** `StickFigure` is
  groups pivoted at shoulder/elbow/hip/knee with the capsule hanging below, so
  a pose is a table of rotations (`x` swings forward, `spread` swings out and
  is mirrored per side). Angles are damped every frame, so figures ease between
  poses. A pose's `roll` lays the body on its side; that roll is animated
  *inside* StickFigure while the collider gets the end-state quaternion via
  `setRotationWrtParent` — the rigid body has rotations frozen, so the visual
  group only ever carries yaw.
- **Painting is UV painting, not decals.** Every body part owns a 256² canvas
  used as its material `map` (`src/lib/skin.ts`, keyed by player id, `SELF` for
  the local one). Painting raycasts the cursor against your own figure and
  draws a dot at the reported `uv`; a dot near a capsule seam is drawn twice so
  the wrap does not show. **Brush size is an absolute radius in figure-local
  units, not a fraction of a texture** — each part's texture wraps a different
  circumference, so the same fraction painted a far bigger mark on the head
  than on a forearm. `PART_SHAPE` in `skin.ts` holds every part's real radius
  and length, `StickFigure` builds its geometry from that same table, and the
  brush becomes an ellipse in texture space (U spans the circumference, V spans
  the length plus the two caps) so it lands as a circle on the body. Strokes are batched every 100 ms and sent as compact
  strings; the server keeps up to 800 per player **in schema** so late joiners
  see existing paint, and relays new ones to everyone but the painter.
- **Painting needs no mode, only a free cursor.** Anyone whose pointer is not
  locked (always a hider) paints by left-dragging on their own body and turns
  the camera by right-dragging. Hovering the body pops `PaintPanel` open on its
  own; it stays up for `PALETTE_LINGER_MS` after the cursor leaves so you can
  reach it, and the header pins it. The pin is how a *seeker* paints: pinning
  releases their pointer lock and drops them to third person. `Game` has to
  know about that, or losing the lock would raise the pause menu.
- **Never call into rapier from a React effect — only from `useFrame`.** A
  handle touched after its world is gone (an HMR remount is enough) panics
  inside wasm: the console shows one `RuntimeError: unreachable` followed by an
  endless flood of `recursive use of an object detected which would lead to
  unsafe aliasing in rust`. Once that happens the module is poisoned, *every*
  later rapier call throws, physics is dead and the frame loop aborts halfway —
  which looks like the player teleporting into the ground and the screen going
  white. `useFrame` is the one place the world is guaranteed alive. Colliders
  are likewise swapped by React (a `key` on `CuboidCollider`) rather than by
  mutating the shape in place.
- **Resizing the collider must move the body too.** A pose with a smaller
  `shape` swaps the cuboid's half-extents, and resizing around a fixed centre
  buries half of a *growing* box in the floor — rapier resolves that by
  dropping the player out of the world, which looks like "pausing teleported me
  into the ground" and leaves a white screen (you are under the room, seeing
  the background). The effect in `Player.tsx` shifts the body by the change in
  half-height so the feet stay put. There is also a `y < -3` catch in the frame
  loop, since nothing under the floor can ever recover on its own.
- **Pausing has to clear `paused` itself.** It used to rely on regaining the
  pointer lock, but the browser rate-limits a re-lock for about a second after
  Esc, so Resume silently did nothing — and for a hider, who has no lock at
  all, it grabbed the cursor and made every later click go to the canvas
  instead of the buttons. `resume()` sets the state and only re-locks a seeker.
- **A paused frame must still read a *complete* key state.** `Player` swaps in
  `NO_KEYS` — every control explicitly `false` — not `{}`. A missing entry
  reads back `undefined`, `Number(undefined)` is NaN, and that NaN went straight
  into `setLinvel` and `setRotationWrtParent`: rapier panics ("unreachable"),
  the wasm module is poisoned for the rest of the session ("recursive use of an
  object…"), and the body leaves the world, so the `y < -3` catch dropped the
  player back at SPAWN. That was the whole "pause breaks the game and teleports
  me to the middle" bug.
- **Pause freezes the mouse too, not just the keys.** Every pointer handler in
  `Player` returns early on `pausedRef`. Without that you could still paint,
  shoot, zoom and orbit while paused — and worse, a hover over your own body
  opened the palette, and `setPaintOpen` clears `paused`, so the menu vanished
  the instant you moved the cursor toward it. Pause also calls
  `document.exitPointerLock()`, and Esc closes the menu for **both** roles: a
  seeker's Esc is eaten by the browser only while the lock is held, and once
  the menu is up it is not.
- **`RigidBody position` must be a stable array.** @react-three/rapier re-applies
  the prop when its identity changes, and a literal `[0, 4, 0]` is a new array
  every render — so any state change (pausing, picking a colour) teleported the
  player back to spawn. It is the module-level `SPAWN` constant now. The hover ring is a
  world-space `ringGeometry` sized by `brushWorldRadius` — a part's texture
  wraps its circumference, so `size × 2π × radius` is the dot's real width.
- **Seekers broadcast camera yaw, not body yaw**, so hiders can read where a
  seeker is looking. `pitch` is broadcast too. On a remote seeker the gun arm
  leaves the pose entirely: `StickFigure`'s `aim` prop points the right arm
  along the aim (`x = π/2 + pitch`, yaw already being the figure's rotation)
  and the shotgun rides in that hand via `holding`. Hiders broadcast their Q/E
  body yaw and `pitch: 0`. There is one `net.yaw` for both now, because a
  seeker's `bodyYaw` *is* their camera yaw — except while they are painting, when
  it is left alone so they can orbit around their own figure.
- **Shooting** raycasts from screen centre against the remote figures
  (`remoteFigures`, registered by `RemotePlayers`) *and* meshes named
  `ROOM_SURFACE`, and takes whichever is nearer — so nobody is shot through a
  wall. A wall hit relays a `mark`, which every client renders and drops after
  3s. A player hit sends `kill`.
- **A kill is called by the shooter, checked by the server.** Same trust model
  as movement. `server.mjs` verifies the caller is a seeker and the victim is
  someone else who exists, pushes the death position onto `state.graves`,
  broadcasts `killed`, deletes the victim and disconnects them 250 ms later —
  the delay is what lets the death message land first. The victim's client
  shows `DeathScreen`, whose respawn is a plain re-join of the same session.
- **Graves are state, not a broadcast.** They are permanent, so a player
  joining an hour later still has to see all of them; `graves.onAdd` fires for
  the backlog and for new ones alike. Capped at 200. They are deliberately not
  named `ROOM_SURFACE` — a grave should not stop a bullet or the camera.
- **Camera never leaves the arena**: the third-person camera raycasts toward its
  desired position and pulls in to `hit.distance - 0.35`, floored at 1.4.
- **Jump needs a real ground test and an edge trigger.** Grounded is a short ray
  straight down against `ROOM_SURFACE` (`half + GROUND_REACH`). It used to be
  `|velocity.y| < 0.05`, which is *also* true at the apex of a jump — so holding
  `Space` relaunched you at every apex and you rose forever. The ray alone is not
  enough either: `jumpHeld` makes a jump fire on the press, so a held key is one
  jump and not a hover.

## Arena

40×40, 12 high, white. Twenty-five fixed pieces, written as JSX through the
local `Solid` helper rather than a position/size table — they are no longer all
boxes. Every surface is named `ROOM_SURFACE` — that name is what shots and
camera collision filter on, so **new geometry must carry it** to behave
correctly.

**A non-box shape must name the collider it needs.** `Solid`'s `colliders` prop
is passed to rapier's auto-generation: `cuboid` reads a bounding box (correct
for boxes, including rotated ones like the ramp), `hull` wraps the real vertices
(cylinders, cones, the crystal, the capsule), `ball` is the exact sphere, and
the ring **must** be `trimesh` — a hull would fill its hole in. Getting this
wrong does not error, it just gives the piece an invisible box around it.

**Everything tall has a way up.** Jump apex is `JUMP_SPEED²/2g` ≈ 3 units, so no
step in the room is more than ~2: the ziggurat is three 1-unit tiers, the
divider is a lip then a wall, the stairs rise 0.9 each onto a catwalk that
dead-ends at the slab, and the big drum has a smaller drum beside it as its
step. The cone, capsule and crystal are the deliberate exceptions.

**Some pieces are painted in exact `PAINT` hexes** (`palette.ts`), which is the
same table `PaintPanel` renders as its swatch row. That is the point: pick the
matching swatch, paint yourself, and you can test camouflage against a true
match instead of eyeballing it. Nine of the ten presets appear in the room —
white is the room itself.

`ROOM_HALF` in `Room.tsx` and `ROOM_LIMIT` in `server.mjs` describe the same
bound and must be changed together (currently 20 and 19.9 — see the collider
note under Roles and controls for why the margin is so thin).

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

**The player name is per tab, in `sessionStorage`, not a cookie.** Two tabs on
one machine is how you test two players locally, and a cookie made them share
and clobber one name. `RoleMenu` also expires the old `mc_name` cookie on mount.
Nothing else is persisted — the session you pick is chosen fresh every time.

**Room state.** One Colyseus room, `"game"`, `MapSchema<Player>` of
`{name, role, x, y, z, yaw, pitch, pose, strokes}`, patched at 20 Hz. Messages:
`state`, `shoot`, `paint`, `clearSkin` (client→server); `mark` (server→all),
`paint` and `clearSkin` (server→everyone except the sender, who already drew
it locally).

`POSE_COUNT` in `server.mjs` and `POSES` in `poses.ts` describe the same set
and must be changed together, as must `MAX_STROKES` there and in `skin.ts`.

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

Paint has no undo and no per-part erase — only "clear paint". There is no
health: a hit is instantly fatal. Round flow (hide phase, timer, win
condition), a lobby with ready-up, and any sound. `MULTIPLAYER_PLAN.md` is the
original design note and is **out of date** — it describes a hand-rolled `ws`
protocol that Colyseus replaced.

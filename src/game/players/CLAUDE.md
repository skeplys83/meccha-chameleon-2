# players — the figures in the room

**Owns:** the local player (input, physics, camera, the network send loop) and
everyone else (interpolated from network targets).

**Entry points:** `Player`, `RemotePlayers`, `remoteFigures`, `controlMap` /
`Control` / `poseControl`.

This is the busiest folder in the project — it is where input, physics, the
figure and the network all meet. `Player.tsx` is also the file where the most
bugs have been fixed; the invariants below are all scars.

## Files

- `Player.tsx` — the local player: the pointer handlers, the physics frame loop
  and the network send timers.
- `camera.ts` — the third-person follow and its pull-in out of walls.
- `cling.ts` — finding a surface to climb, and holding onto it. Pure three.js
  geometry, no React and no rapier, so it imports straight into Node for testing.
- `body.ts` — `BODY`, the collider half-extents per role, derived from the head
  radius in `figure/parts.ts` rather than repeating it.
- `pointerLock.ts` — the shared canvas handle, and the retry loop that actually
  gets the lock back.
- `RemotePlayers.tsx` — everyone else, plus `remoteFigures`, the map
  `combat/` raycasts to hit people.
- `controls.ts` — the keyboard map and the `Control` union.

**What is deliberately *not* extracted from `Player.tsx`:** the collider resize,
`NO_KEYS`, every rapier call, the ground ray and the jump edge trigger. Each of
those is an invariant below with a bug attached, and a mechanical move is exactly
how they get re-broken. The pieces that did come out — the camera, the brush
cursor (`paint/brushCursor.ts`) and the shot raycast (`combat/shoot.ts`) — are
the ones with no physics state in them.

## The two roles do not share a control scheme

Only `WASD` and `Space` mean the same thing to both. Everything else belongs to
one role, and **adding a control means deciding whose it is.**

| | Hider | Seeker |
|---|---|---|
| Camera | third person, orbit | first person |
| Size | half-extents `[0.26, 1, 0.26]` | `[0.52, 1.3, 0.52]` |
| Look | right-drag (cursor stays free) | mouse (pointer locked) |
| Turn the figure | `Q`/`E`, independent of the camera | none — the figure faces the aim |
| Climb | walk into a surface; `W`/`S` up and down it, `A`/`D` across | none |
| Poses | `1`–`5` | none, always upright |
| Zoom | scroll | none |
| Paint | left-drag on your body | pin the palette, drops to third person |
| Let go | `Space` | — (`Space` is their jump) |
| Weapon | none | shotgun, left click |

## Invariants

1. **Re-locking has to retry, not ask once.** Esc releases the lock *and* starts
   a browser cooldown of roughly a second during which `requestPointerLock` is
   silently refused — so a seeker who paused and pressed Resume was left with a
   loose cursor and no way to look around. `requestLock` keeps asking every
   250 ms until it lands. **Anything that deliberately gives the cursor back must
   call `cancelLock`** — pausing, opening the paint panel, dying, leaving — or the
   retry snatches it straight back off the menu, which is a worse bug than the one
   it fixes.
2. **One rule owns the lock, driven by state rather than by buttons.** `Game.tsx`
   holds it for a seeker whenever they are playing at all — not paused, not
   painting, not dead — so joining, resuming, closing the palette and respawning
   are all covered without any of them asking. Adding a new way into play needs
   no new call; adding a new way to hand the cursor back needs a `cancelLock`.
3. **An unfocused tab holds no keys.** Alt-tabbing away delivers the keydown but
   never the keyup, so drei keeps the key held and you come back walking into a
   wall. The frame loop reads `NO_KEYS` when the window is not focused, the same
   mechanism pause already uses, and blur also cancels any drag or orbit that
   will never see its matching up event.
4. **Only the seeker takes the pointer lock.** A hider keeps their cursor — so
   the paint panel is always reachable — and looks around by dragging. A hider
   therefore never *loses* a lock, which is why their Esc is read as a keydown in
   `Game.tsx` while the seeker's arrives as a pointer-lock change.
5. **Jump is a velocity, not an impulse.** The seeker's collider is bigger and so
   heavier; an impulse gave the two roles different jump heights. Horizontal
   movement was already velocity-driven and identical for both.
6. **Jump needs a real ground test *and* an edge trigger.** Grounded is a short
   ray straight down against `ROOM_SURFACE` (`half + GROUND_REACH`). It used to
   be `|velocity.y| < 0.05`, which is *also* true at the apex of a jump — so
   holding `Space` relaunched you at every apex and you rose forever. The ray
   alone is not enough either: `jumpHeld` makes a jump fire on the press, so a
   held key is one jump and not a hover.
7. **Resizing the collider must move the body too.** A pose with a smaller
   `shape` swaps the cuboid's half-extents, and resizing around a fixed centre
   buries half of a *growing* box in the floor — rapier resolves that by dropping
   the player out of the world, which looks like "pausing teleported me into the
   ground" and leaves a white screen (you are under the room, seeing the
   background). The frame loop shifts the body by the change in half-height so
   the feet stay put. There is also a `y < -3` catch, since nothing under the
   floor can ever recover on its own.
8. **A paused frame must still read a *complete* key state.** `Player` swaps in
   `NO_KEYS` — every control explicitly `false` — never `{}`. A missing entry
   reads back `undefined`, `Number(undefined)` is `NaN`, and that `NaN` went
   straight into `setLinvel` and `setRotationWrtParent`: rapier panics
   ("unreachable"), the wasm module is poisoned for the rest of the session
   ("recursive use of an object…"), and the body leaves the world, so the
   `y < -3` catch dropped the player back at spawn. That was the whole "pause
   breaks the game and teleports me to the middle" bug.
9. **Pause freezes the mouse too, not just the keys.** Every pointer handler
   returns early on `pausedRef`. Without that you could still paint, shoot, zoom
   and orbit while paused — and worse, a hover over your own body opened the
   palette, and opening the palette clears `paused`, so the menu vanished the
   instant you moved the cursor toward it.
10. **`RigidBody position` must be a stable array.** @react-three/rapier
   re-applies the prop when its identity changes, and a literal `[0, 4, 0]` is a
   new array every render — so any state change (pausing, picking a colour)
   teleported the player back to spawn. It is the module-level `SPAWN` constant.
11. **Seekers broadcast camera yaw, not body yaw**, so hiders can read where a
   seeker is looking; `pitch` goes with it. There is one `net.yaw` for both roles
   because a seeker's `bodyYaw` *is* their camera yaw — except while they are
   painting, when it is left alone so they can orbit around their own figure.
   Hiders broadcast their `Q`/`E` body yaw and `pitch: 0`.
12. **The camera never leaves the arena.** `camera.ts` raycasts toward the desired
   position and pulls in to `hit.distance - 0.35`, floored at 1.4. Without it the
   camera walks through a wall and you find yourself looking at the arena from
   outside, which reads as the game having broken.
13. **A stroke in flight outranks every other meaning of the mouse.**
    `onMouseMove` checks `brushCursor.drawing` first, so pressing the right
    button mid-drag does not cancel the stroke and start orbiting.
14. **Remote transforms are damped, never snapped** — except on the very first
    frame, or a joining player flies in from the origin.
15. **The shotgun is rate-limited here as well as on the server.** `lastShot`
    against `FIRE_INTERVAL_MS`, checked before the raycast, so a held button is
    one shot. The client copy is for feel; the server's is what actually binds.
16. **A hider climbs, and never reorients while doing it.** There is no grab
    key: walking squarely into a wall takes you onto it. `W` and `S` then run up
    and down the face, `A`/`D` go across it, and `Space` is the only way off. The
    whole state is one vector — `cling`, the surface normal pointing back at the
    body — and the figure stays upright throughout. That constraint is what keeps
    the feature small: the camera, the poses and the `yaw` on the wire are all
    untouched by it. Do not be tempted to rotate the figure onto the surface
    without also rebuilding the camera basis, or `W` walks down the screen.
17. **On a wall, movement uses the wall's own axes, not the camera's.** `W` is up
    the face wherever you are looking, which is the whole point of `wallTangents`.
    On a *ceiling* there is no "up the surface", so movement falls back to
    ordinary camera-relative walking — which for a flat roof is exactly right.
18. **The probe reach depends on direction.** A hider is 0.26 wide and 1 tall, so
    one reach cannot serve both: an upward probe using the sideways reach would
    never see the ceiling their head is already touching, and a sideways probe
    using the vertical one would grab walls a body-length away. `reachFor` is the
    box's support function, and getting it wrong is why the first version could
    not wrap onto the ceiling at all.
19. **Gravity is switched off per body, not globally.** `setGravityScale(0)` while
    clinging, `1` otherwise, set every frame from one place so the two can never
    disagree. A constant `STICK_SPEED` into the surface holds contact.
20. **Climbing off the top of something is not a special case.** The per-frame
    `holdsCling` ray simply misses, gravity comes back, and you drop the last few
    centimetres onto the top face. Losing the surface is already the "let go"
    path; reusing it is why there is no ledge-mantling code.
21. **`RECLING_GRACE` and a push on release.** Without both, `Space` lets go and
    the next frame walks you straight back into the wall you are still touching,
    so it appears to do nothing.
22. **One wrap rule covers every edge.** `wrapCling` probes whatever you are
    climbing *toward*; a face different from the one you hold becomes the new
    one. That is wall→ceiling, inside corners, and ceiling→wall, with no cases.
23. **Your own footsteps live in this file**, because it is the only place that
    knows you are grounded — nobody else's `grounded` is on the wire. They play
    without a position (you are the listener) and a little quieter than everyone
    else's. The `Stepper` is built with `strideFor(role)`, so a hider's cadence is
    quicker than a seeker's. Remote footsteps are `sound/SoundStage.tsx`.

## Contracts

- **Reads `world/Room.tsx`** for `ROOM_SURFACE`, collected once from the scene
  graph on mount because the room is static.
- **Reads `shared/protocol.ts`** for `Role`, **`figure/`** for `POSES`,
  `poseExtents` and `StickFigure`, **`paint/`** for the brush and the stroke
  encoding, and **`net/`** for the senders.
- **Publishes `remoteFigures`**, keyed by session id with the id also stamped on
  each group's `userData`, so `combat/` can walk a hit mesh back to its owner.
- **`controls.ts` builds one binding per entry in `POSES`.** The legend in
  `hud/ControlsPanel.tsx` is the other half of this contract: if a row is on a
  card, that role must really have it wired up here.
- Sends on a 50 ms `setInterval`, not from `useFrame` — see `net/CLAUDE.md`.
- **Reads `sound/`** for `playSound`, `startLoop`/`stopLoop` and the `Stepper`,
  and `shared/` for `FIRE_INTERVAL_MS`.
- **Climbing needs `world/`'s `ROOM_SURFACE` meshes**, the same list already
  collected once for shooting, the ground ray and the camera. Every surface in
  the arena is therefore climbable for free — walls, ceiling, all 25 obstacles,
  including the curved ones. Nothing had to opt in.
- **Climbing is hider-only in both places.** `Player.tsx` never sets `cling` for
  a seeker, and `server/room.ts` refuses the flag from one — the client for
  behaviour, the server because the flag's *effect* (silence) reaches everybody.
- **`cling` is broadcast** so other clients can keep a climber's footsteps quiet;
  their stepper only sees a position, and sliding along a wall looks exactly like
  walking. Nothing else about climbing goes on the wire, because the figure does
  not reorient — the existing `yaw` still describes it completely.
- **Owns the brush loop.** `createBrushCursor`'s `onDrawingChange` starts and
  stops it, and the pointer effect's teardown stops it again — a loop outlives the
  component that started it otherwise.

## Not built yet

No prediction or reconciliation (the server never corrects you, it only clamps),
no footstep or collision sound, no crouch-walk or sprint.

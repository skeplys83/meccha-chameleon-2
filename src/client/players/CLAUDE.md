# players — the body you drive, and the ones you watch

**Owns:** the local player, the remote ones, the pointer lock, the camera, the
climbing, and `BODY` (the collider size for each role).

## What's here

| file                      | what                                                     |
| ------------------------- | -------------------------------------------------------- |
| `Player.tsx`              | the local body: one frame loop, and the state it moves    |
| `look.ts`                 | `Look` and `Motion` — the two mutable structs it moves    |
| `usePointerControls.ts`   | every meaning of the mouse, and the strokes it produces   |
| `useStateBroadcast.ts`    | your transform, on a timer                                |
| `useEyedropperReadback.ts`| the framebuffer read, at frame priority 3                 |
| `buried.ts`               | how much of you is inside a wall — developer mode only    |
| `RemotePlayers.tsx`       | everybody else, damped toward their last packet           |
| `controls.ts` `controller.ts` `camera.ts` `cling.ts` `body.ts` `pointerLock.ts` | the pieces each of those uses |

## The two roles do not share a control scheme

A **hunter** is first person and holds the pointer lock. A **chameleon** is third
person, keeps their cursor (so the brush and palette are always to hand), looks
around by right-dragging, turns their body with Q/E, poses with the number keys,
and climbs. That asymmetry is the reason for most of the rules below.

## The three rules that will bite you

1. **One effect owns the pointer lock, driven by state rather than by buttons.**
   Every button that hands control back would otherwise have to re-take it, and
   a `requestLock` landing after a menu opened snatches the cursor off it. The
   lock is also read from the *document* on mount, never assumed false — this
   component is rebuilt on every room change and the lock survives that.
2. **Nothing but the frame loop moves the body, and it must not move it through
   a world that has not arrived.** The player is kinematic; a map still loading
   has no colliders, so the loop returns early while `solids` is empty and holds
   the body still rather than dropping it through where the floor will be.
3. **What stays put across a pose change is the box's *underside*, not its
   half-height.** Each pose states its own whole box in world axes; a pose that
   is offset *and* resized changes the foot by neither on its own, so the body
   is moved by the difference or a chameleon lying down sinks or hops.

## Ownership, since the split

`Look` (yaw, pitch, zoom, locked, orbiting, focused) is **created and written by
`usePointerControls`** and read by the frame loop. `Motion` (bodyYaw, vy,
grounded, jumpHeld, cling, reclingGrace, footOffset) is **created and written by
`Player.tsx`**. Nothing writes across that line, and `react-hooks/immutability`
enforces it: a ref handed *into* a hook and mutated there is an error, as is
mutating one a hook returned.

## The jump is forgiving, and none of the forgiveness adds height

Four numbers, all of them slack rather than power:

- **Coyote time** (0.15s) — ground credit that keeps running after you walk off
  an edge, so a press one frame late still fires.
- **Jump buffer** (0.16s) — a press made just before landing is spent on the
  landing rather than eaten. Not queued while clinging, where the same key means
  "let go" and buffering it fired a jump the instant the chameleon touched down.
- **Cut gravity** (×2.2) — release early and the rise ends early. This is the
  short hop, and it is the only thing the key's *duration* controls.
- **Fall gravity** (×1.25) — falling faster than you rose is what reads as
  weight. A symmetric arc hangs.

**Cut gravity never reduces the apex** — it only ever applies after the key is
released, so what a full-held jump can reach is decided by `JUMP_SPEED` and
`GRAVITY` alone. At 10 against 12 that is **4.08 units**, with 1.57s of airtime;
a tap reaches 1.99.

**The apex is a map constraint, not a feel knob.** Ledges are built against it
(`docs/notes/world.md`, invariant 7), so raising it puts places within reach
that a map may not have meant to offer. And it is *not* affected by
`BODY_SCALE`: a shrunken player still jumps 4.08 world units, which is now 2.4
of their own heights rather than 2.1. Scale `JUMP_SPEED` too if you want the
jump to shrink with the body.

**A head on a ceiling ends the jump.** Asking to rise and being allowed less
than 40% of it is a bump, and `vy` is cut to zero. Without it the velocity
survives the collision and the player grinds along the underside of the roof
until gravity finally eats it, which you feel through the camera as pressing
upward into nothing.

## `BODY_SCALE` is the one number that resizes a player

Everything proportional hangs off `BODY` in `body.ts`, so one factor per role
moves all of it at once: the collider, the figure's own scale, eye height, the
brush ring, the footstep stride and its pitch, the cling tolerance, and every
pose's box. Most of all it keeps the ratio the hiding mechanic depends on — a
chameleon's collider is deliberately far narrower than the body it carries, and
scaling all three half-extents together leaves that gap exactly where it was.

Four things do **not** follow from `BODY`, and three of them are deliberate:

- **Pose boxes** are a fitted table in `figure/poses.ts`, not derived from
  `BODY`, so they are scaled explicitly against the height they were fitted at.
  Miss this and the figure shrinks while its lying and curled colliders stay
  the size they were.
- **The viewmodel** hangs off the camera, not the body, so `combat/Viewmodel.tsx`
  scales itself by `BODY_SCALE.hunter`.
- **`SPEED`, `JUMP_SPEED`, `GRAVITY` and the camera's zoom range** are measured
  in the world, not in bodies. Left alone on purpose: a smaller player at the
  same speed covers the map just as fast, so the room *looks* bigger without
  taking longer to cross. Scale them if you want the whole effect.
- **The name badge's gap** above a remote head is scaled in `RemotePlayers.tsx`,
  because it is a distance from a body rather than a distance in the room.

## The follow camera tests where the lens *ends up*, not where it was aimed

Two passes, and the second one is not redundant. The first raycasts from the
body outwards and either pulls the camera in (a wall) or **lifts it** (the
ground — sliding along the floor rather than backing off it, or a lying
player's aim point collapses the shot to the minimum distance). That lift is a
sideways step out of the line just cleared, and in a room with a ceiling on it
the step can finish on the far side of the roof. So a second ray tests the seat
the lens actually took. That is the "camera sometimes clips through the
ceiling" which survived every fix to the first pass.

It raycasts `shell` only — floor, walls, ceiling — never the furniture. See
`world/CLAUDE.md`.

## Contracts

- **`Game.tsx` owns pause, paint and the role**; this folder receives them as
  props. `frozen` is not `paused` — a rooted survivor keeps their mouse.
- **Publishes `remoteFigures`** for `combat/shoot.ts` to raycast.
- **Sends** `state` (on a timer, never from `useFrame` — a backgrounded tab runs
  no frames and would look like the player vanishing), `paint`, `shoot`, `kill`.
- **A pose change moves the body; a surface change never does.** The box shifts
  the body so its underside stays put across a pose change, or a chameleon lying
  down sinks into the floor. But the box *also* turns when a flat pose stands up
  to grab a wall, and that must move nothing — the cling logic is placing the
  body against the wall itself.

  The test is `surfaceKind !== m.surface`, and getting it wrong is expensive in
  a way that does not show up where the mistake is. Suppressing only the shift,
  and still recording the new offset, made **grabbing** a wall look fine and
  **letting go** drop the body 0.73 units — straight through the floor, one
  interaction later.
- **A surface change re-seats the body**, though (`seatOn` in `cling.ts`). The
  box it was placed for has just been replaced, and nothing else will move it: a
  chameleon wrapping from a wall onto a ceiling was left a body-length below the
  ceiling it was touching, out of reach of its own cling probe — which sees
  about 0.42 — and fell off. It is the same idea as keeping the feet put, along
  whatever the body is holding rather than down.
- **The body's centre may never cross a surface** (`inside.ts`). The character
  controller resolves *movement*, from where the body already is — so it never
  sees the three things that actually put a chameleon through a wall: the foot
  compensation and `seatOn` both shift the body outright, and the collider is
  **rebuilt at a different size** when a pose changes its box, which can bring
  it into existence already overlapping. A sweep from last frame's position to
  this one catches all three.

  It is a backstop, not the collision system, and it is only half the answer:
  it cannot help when the *box changes shape* around a centre that never moved,
  which is what `figure/`'s footprint rule is for. **It does not stop the body
  overlapping** — the collider is deliberately narrower than the figure and that
  gap is the hiding mechanic. What it guarantees is that the centre stays on the
  room's side of every wall, so a chameleon can sink into scenery and never end
  up behind it.
- **`clingKind` turns a cling normal into the wire value.** The normal points
  back at the player, so a ceiling's points down. It decides which way up
  `figure/` draws a pose that lies flat, and which way round its box sits — so
  it is React state here, not a frame-loop local, because the collider is keyed
  on that box.
- **A hunter broadcasts camera yaw, not body yaw**, so chameleons can read where
  the gun hunting them is pointed.

---

Thirty-five invariants, the camera tuning, the autostep number and the climbing
geometry: [docs/notes/players.md](../../../docs/notes/players.md).

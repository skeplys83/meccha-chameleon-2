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

## Contracts

- **`Game.tsx` owns pause, paint and the role**; this folder receives them as
  props. `frozen` is not `paused` — a rooted survivor keeps their mouse.
- **Publishes `remoteFigures`** for `combat/shoot.ts` to raycast.
- **Sends** `state` (on a timer, never from `useFrame` — a backgrounded tab runs
  no frames and would look like the player vanishing), `paint`, `shoot`, `kill`.
- **A hunter broadcasts camera yaw, not body yaw**, so chameleons can read where
  the gun hunting them is pointed.

---

Thirty-five invariants, the camera tuning, the autostep number and the climbing
geometry: [docs/notes/players.md](../../../docs/notes/players.md).

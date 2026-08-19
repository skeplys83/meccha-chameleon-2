<!-- Archive. The short doc that agents actually read is the CLAUDE.md in
     the folder this describes. Everything here is the long-form reasoning
     behind it: the full invariant list, the tuning, and the debugging
     sessions each rule was paid for with. Kept because it is expensive
     knowledge, demoted because nobody finishes a 500-line file. -->

# combat — the gun and its consequences

**Owns:** the shotgun prop, the hunter's first-person viewmodel, and the two
kinds of thing a shot leaves behind.

**Entry points:** `Shotgun`, `Viewmodel`, `Marks`, `Graves`.

The *trigger* is still in `players/Player.tsx` — deciding a click is a shot needs
the pointer-lock state. This folder owns what the shot hits, and the aftermath.

## Files

- `shoot.ts` — `resolveShot`: one raycast from screen centre, returning a player,
  an oriented wall hit, or nothing.
- `Shotgun.tsx` — the prop, barrel pointing down −Z. Shared by the viewmodel and
  by the figure other players see.
- `Viewmodel.tsx` — the hunter's own arms and gun, riding the camera. It copies
  the camera's transform, so it runs at **frame priority 1** — after the movement
  callback that places the camera. Mount order used to be what ordered these two,
  and it is not reliable: `Player` is keyed on the room and this is not, so
  crossing into a match re-registered the player *after* the viewmodel and the
  gun spent every match reading last frame's camera — it swam around as you
  walked, in matches but never in the lobby. See `Scene.tsx` for the priorities.
- `Marks.tsx` — yellow patches where a shot hit a wall, each with the thin black
  line the shot travelled along. Three seconds. `Mark` is
  an **alias** of `net/events`'s `NetMark`, not a second declaration: a mark is
  made by the server and handed to this component without changing shape, so two
  identical types would only wait to drift apart.
- `Graves.tsx` — red squares where somebody died. Permanent.

**A hit is a catch, not a kill.** `shoot.ts` and the trigger are unchanged — the
raycast, the rate limit and the mark all work as they did — but what the server
does with a hit on a player is convert them: `role` flips to hunter, paint is
wiped, and they carry on playing. Nothing in this folder needs to know that, and
that is the point of it living on the server; the only visible consequence here
is that `Graves` now marks *where somebody was found* rather than where they
died, and each grave carries the name for the reveal.

## Invariants

1. **A shot raycasts people and walls together, and the nearer one wins.** That
   is why `resolveShot` is one function and not two: checking people first and
   falling back to walls would let a hunter shoot a chameleon through a wall. A wall
   hit relays a `mark`; a player hit sends `kill`.
2. **The tracer rides on the mark, so the two cannot disagree.** A shot reports
   its origin as well as its impact, the server relays both, and `Marks.tsx`
   draws the line from one to the other. There is no second timer: `Scene.tsx`
   drops the mark after `MARK_LIFETIME` and the line goes with it, so "exactly as
   long as the patch" is true by construction. A killing shot relays no mark, so
   it draws no line either.
3. **The tracer is transparent and depth-tested but not depth-written.** Tested,
   so a wall still hides it — a tracer visible through geometry would give away
   shots nobody could have seen. Not written, so it never sorts against itself or
   against the patch at the end of it.
4. **The tracer is a cylinder, not a `THREE.Line`.** GL line width is capped at
   one pixel on every desktop driver worth naming, so a real line can be neither
   thickened nor thinned. A cylinder has an honest width in world units — it
   thins with distance and goes sub-pixel far across the arena, which is the
   trade for being adjustable at all. `TRACER_RADIUS` is the knob.
5. **`resolveShot` returns the wall hit already oriented** — position nudged off
   the surface along its normal, rotation facing out of it — because that is what
   the mark needs and the caller has no better place to work it out.
6. **The shotgun has a cooldown, enforced on both sides.**
   `FIRE_INTERVAL_MS` in `shared/` — the trigger-pull is what is limited, not the
   hit, so clicking faster simply does nothing rather than queueing. Without it a
   held mouse button is a machine gun, a wall of noise and a stream of marks.
7. **A kill is called by the shooter and checked by the server.** Same trust
   model as movement. The client does not decide the victim dies — it asserts a
   hit, and `server/room.ts` verifies the caller is a hunter and the victim
   exists.
8. **Graves are permanent and marks are not**, and that difference decides how
   each travels: graves are server *state* so a player joining an hour later
   still sees them all (capped at 200), marks are a broadcast that every client
   drops after 3 s. See `server/CLAUDE.md`.
9. **Graves are deliberately not named `ROOM_SURFACE`.** A grave is paint on the
   floor: it must not stop a bullet or the third-person camera. Naming it would
   make the room slowly fill with invisible walls where people died.
10. **The viewmodel rides the camera, it is not parented to it.** The camera is
   driven imperatively in `players/Player.tsx`, so the viewmodel copies its
   position and quaternion each frame. Everything in it is expressed in camera
   space: −Z is forward.
11. **The viewmodel's arms are plain white, and that is a known regression.**
   They used to wear the local player's paint, which worked while every part had
   its own texture. The model's unwrap scatters a forearm across four UV
   islands, so there is no rectangle to map a capsule into and no honest way to
   fake it. The fix is to build these arms from the model's own forearm
   geometry, which carries the right UVs by construction; until then a hunter
   does not see their own colours in first person.
12. **A remote hunter's gun arm leaves the pose.** `figure/StickFigure` takes an
   `aim` prop that points the right arm along the aim and a `holding` prop that
   puts the shotgun in that hand — portalled onto the model's `LowerArmR` bone,
   so the skeleton carries it. The rig has no hand bone, so the grip is pushed
   down the forearm's own axis by `FOREARM_LENGTH`. Rotating that group +90°
   about X turns the gun's −Z barrel to run down the arm.

## Contracts

- **Reads `players/RemotePlayers`** for `remoteFigures` and their `userData.remoteId`.
- **Reads `world/Room`** for `ROOM_SURFACE` (via `Player`'s collected list).
- **`Marks.tsx` manages its own mark timers and subscriptions**, while `Scene.tsx` passes the grave list to `Graves.tsx`.
- **`Game.tsx` owns the round-over and caught overlays** — the victim is out of the room by the
  time it appears, so respawning is a fresh join to the same session.

## Not built yet

No health — a hit is instantly fatal. No spread, no pellets, no reload, no
recoil and no muzzle flash. The bang itself lives in `sound/`; there is no visual
feedback for the cooldown, so a blocked click is silent and invisible. `Marks` and `Graves` are flat planes with
no decal projection, so they float on curved pieces.

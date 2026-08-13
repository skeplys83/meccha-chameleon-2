# players — the figures in the room

**Owns:** the local player (input, physics, camera, the network send loop) and
everyone else (interpolated from network targets).

**Entry points:** `Player`, `RemotePlayers`, `remoteFigures`, `controlMap` /
`Control` / `poseControl`.

This is the busiest folder in the project — it is where input, physics, the
figure and the network all meet. `Player.tsx` is also the file where the most
bugs have been fixed; the invariants below are all scars.

## Files

- `Player.tsx` — the local player: the pointer handlers, the movement frame loop
  and the network send timers.
- `controller.ts` — rapier's kinematic character controller, one per physics
  world, made on first use *from the frame loop*.
- `camera.ts` — the third-person follow and its pull-in out of walls.
- `cling.ts` — finding a surface to climb, and holding onto it. Pure three.js
  geometry, no React and no rapier, so it imports straight into Node for testing.
- `body.ts` — `BODY`, the collider half-extents per role, derived from the head
  radius in `figure/parts.ts` rather than repeating it, and `GRAVITY`, which
  `Player.tsx` integrates and `Scene.tsx` hands to `<Physics>`.
- `pointerLock.ts` — the shared canvas handle, and the retry loop that actually
  gets the lock back.
- `RemotePlayers.tsx` — everyone else, plus `remoteFigures`, the map
  `combat/` raycasts to hit people.
- `controls.ts` — the keyboard map and the `Control` union.

**What is deliberately *not* extracted from `Player.tsx`:** the collider resize,
`NO_KEYS`, the movement integration and the jump edge trigger. Each of
those is an invariant below with a bug attached, and a mechanical move is exactly
how they get re-broken. The pieces that did come out — the camera, the brush
cursor (`paint/brushCursor.ts`) and the shot raycast (`combat/shoot.ts`) — are
the ones with no physics state in them.

## The two roles do not share a control scheme

Only `WASD` and `Space` mean the same thing to both. Everything else belongs to
one role, and **adding a control means deciding whose it is.**

| | Chameleon | Hunter |
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

1. **Losing the window pauses the game, for both roles.** A hunter got it for
   free — alt-tabbing drops the pointer lock and losing the lock raises their
   menu — but a chameleon holds no lock, so they used to come back to a world
   that had carried on: whistling, being hunted, and taking a catch they never
   saw. `Game.tsx` listens for `blur` and `visibilitychange` and pauses on both.
   Reading `NO_KEYS` while unfocused (invariant 5) is a *separate* rule and both
   are needed: one stops you walking into a wall, the other stops the game
   happening to you while you are not looking. It does not un-pause on the way
   back, for the reason in the next invariant.
2. **Esc cannot leave the pause menu; only clicking Resume can.** This is a rule
   about the pointer lock, not about menus. Esc is *how the lock is released*, and
   the browser then refuses to hand it back for about a second — so resuming with
   the same key asked for it milliseconds after giving it up, which Chrome answers
   with `SecurityError: Pointer lock cannot be acquired immediately after the user
   has exited the lock` and the dev overlay paints over the running game as a
   crash — Vite's now, Next's before, and identically fatal to the illusion. A
   click on Resume is a fresh gesture, far enough after the release to be
   granted. The
   same reasoning covers tabbing away and back: the browser drops the lock, the
   menu comes up, and it stays up until a click asks for the lock again.
3. **`locked` must be read from the document on mount, never assumed false.**
   It is a ref, so it starts `false` every time this component is built — and it
   is built on a room change *and* on a role change, while the canvas and the
   browser's lock outlive both. A lock that never dropped fires no
   `pointerlockchange`, so nothing corrected the ref and it stayed `false` for
   the session: a hunter carried into the match could not look around, because
   `onMouseMove` reads it to decide whether the mouse means "turn the camera".
   Pausing and un-pausing appeared to fix it only because that genuinely drops
   and retakes the lock.
4. **A missing lock target is a reason to wait, not to give up.** `requestLock`
   retries when `target` is null instead of returning. `Player` owns the canvas
   handle and lives inside r3f's own reconciler, so its mount effect is not
   ordered against `Game.tsx`'s; a role change rebuilds the player, the old
   teardown clears the target and the new effect sets it back, and the ask can
   land in between. Bailing there left a freshly caught chameleon a hunter with a
   loose cursor, right-click-orbiting a first-person camera.
5. **One effect owns the lock, and owning it means *releasing* it too.** A
   chameleon is not simply "never asked" for the lock — they are made to let go,
   because everybody waits in the lobby as a hunter and so a player carried into
   a match as a chameleon **arrives already holding one**: the lock is on the
   canvas, and the canvas outlives the trip. Left held, they had no cursor at
   all — no palette, no right-drag to look around — and the only escape was Esc,
   which drops the lock and raises the pause menu. That is the same "pause and
   un-pause and then it works" symptom as the hunter's, arriving from the
   opposite direction.
6. **Losing a lock means the player wants out; never having had one does not.**
   `Game.tsx` tracks whether this hunter has actually held it, and only pauses on
   a lock that was *lost*. A caught chameleon becomes a hunter without clicking
   anything, so `requestPointerLock` has no gesture to spend and is refused —
   and reading that refusal as Esc paused the game the instant you converted,
   which is the "respawn with a gun but stuck in place" bug.
7. **Re-locking retries, and never throws.** `requestLock` keeps asking every
   250 ms for about two seconds, because a click on Resume can still land inside
   the cooldown. A refusal arrives two ways depending on the browser — older
   Chrome throws `SecurityError` synchronously, newer Chrome rejects a promise —
   and **both must be swallowed**: an escaped one is caught by the dev overlay
   and thrown over the game as a red modal. **Anything that deliberately gives the
   cursor back must call `cancelLock`** — pausing, opening the paint panel, dying,
   leaving — or the retry snatches it straight back off the menu.
8. **One rule owns the lock, driven by state rather than by buttons.** `Game.tsx`
   holds it for a hunter whenever they are playing at all — not paused, not
   painting, not dead — so joining, resuming, closing the palette and respawning
   are all covered without any of them asking. Adding a new way into play needs
   no new call; adding a new way to hand the cursor back needs a `cancelLock`.
9. **An unfocused tab holds no keys.** Alt-tabbing away delivers the keydown but
   never the keyup, so drei keeps the key held and you come back walking into a
   wall. The frame loop reads `NO_KEYS` when the window is not focused, the same
   mechanism pause already uses, and blur also cancels any drag or orbit that
   will never see its matching up event.
10. **Only the hunter takes the pointer lock.** A chameleon keeps their cursor — so
    the paint panel is always reachable — and looks around by dragging. A chameleon
    therefore never *loses* a lock, which is why their Esc is read as a keydown in
    `Game.tsx` while the hunter's arrives as a pointer-lock change. Neither can
    press Esc to leave the menu — see invariant 1.
11. **The player is a *kinematic* body and nothing but the frame loop moves it.**
    `type="kinematicPosition"`, and every frame ends in exactly one
    `setNextKinematicTranslation`. Rapier no longer accelerates the body, resolves
    it out of geometry, or has any opinion about where it should be; it only
    answers `computeColliderMovement` — "given this collider and this desired
    step, how far may it actually go" — and the answer is applied verbatim.
    Gravity, the arc of a jump and the drop off a ledge are one number, `vy`,
    integrated here against `GRAVITY` from `body.ts`. **Never reintroduce
    `setLinvel`, `applyImpulse` or `setGravityScale`**: they do nothing to a
    kinematic body, so the bug they cause is silence rather than an error.
    `mass` and `enabledRotations` are gone for the same reason — a kinematic
    body has no mass and the solver never rotates it — but **`canSleep={false}`
    stays**: a body that slept would stop reporting its transform.
12. **Jump needs a real ground test *and* an edge trigger.** Grounded is
    `computedGrounded()` off the controller, read after the move and therefore
    one frame old — which is fine, and strictly better than the downward ray it
    replaces: that ray reported "not grounded" whenever you stood on the edge of a
    box with the ray hanging over the side. It used to be `|velocity.y| < 0.05`,
    which is *also* true at the apex of a jump — so holding `Space` relaunched you
    at every apex and you rose forever. Neither test is enough alone: `jumpHeld`
    makes a jump fire on the press, so a held key is one jump and not a hover.
    Standing also needs `GROUND_STICK`, a small constant downward speed, because a
    character asking for exactly zero vertical movement drifts a hair off the
    surface and `computedGrounded` starts flickering.
13. **Resizing the collider must move the body too.** A pose with a smaller
    `shape` swaps the cuboid's half-extents, and resizing around a fixed centre
    buries the feet of a *growing* box in the floor. As a dynamic body that was
    fatal — rapier resolved the penetration by dropping the player out of the
    world, which looked like "pausing teleported me into the ground" and left a
    white screen — and a kinematic body cannot be ejected at all, which is most of
    why it is one. It is still wrong to skip: the frame loop folds the change in
    half-height into `bodyPos` before anything reads it, so the feet stay put. The
    `y < -3` catch is kept as insurance rather than as the load-bearing thing it
    used to be.
14. **A body must not fall through a world that has not loaded.** A map built
    from files suspends and `Room` renders nothing while it does, so between one
    map unmounting and the next committing there are no colliders anywhere. The
    frame loop holds still — zeroing `vy` and returning — for exactly as long as
    `solids` is empty. Without it the player free-falls through that window, and a
    *kinematic* body is never pushed back out of geometry the way the old dynamic
    one was: once the floor appeared above it, it stayed under, sank past
    `FLOOR_ESCAPE_Y` and was flung back to spawn. That is the "I fall through the
    dungeon floor and then get teleported into it" bug, and it only became
    reachable when the player started being rebuilt on every room change.
15. **A paused frame must still read a *complete* key state.** `Player` swaps in
    `NO_KEYS` — every control explicitly `false` — never `{}`. A missing entry
    reads back `undefined`, `Number(undefined)` is `NaN`, and that `NaN` went
    straight into `setLinvel` and `setRotationWrtParent`: rapier panics
    ("unreachable"), the wasm module is poisoned for the rest of the session
    ("recursive use of an object…"), and the body leaves the world, so the
    `y < -3` catch dropped the player back at spawn. That was the whole "pause
    breaks the game and teleports me to the middle" bug. **The kinematic move
    does not soften this** — the calls that would carry a `NaN` are now
    `computeColliderMovement` and `setNextKinematicTranslation`, and wasm panics
    at them just the same.
16. **Pause freezes the mouse too, not just the keys.** Every pointer handler
    returns early on `pausedRef`. Without that you could still paint, shoot, zoom
    and orbit while paused — and worse, a hover over your own body opened the
    palette, and opening the palette clears `paused`, so the menu vanished the
    instant you moved the cursor toward it.
17. **`RigidBody position` must be a stable array.** @react-three/rapier
    re-applies the prop when its identity changes, and a literal `[0, 4, 0]` is a
    new array every render — so any state change (pausing, picking a colour)
    teleported the player back to spawn. It is the module-level `SPAWN` constant.
    The same reasoning is why `desired` and the other scratch vectors are
    module-level: one allocation, never a new identity mid-frame.
18. **Hunters broadcast camera yaw, not body yaw**, so chameleons can read where a
    hunter is looking; `pitch` goes with it. There is one `net.yaw` for both roles
    because a hunter's `bodyYaw` *is* their camera yaw — except while they are
    painting, when it is left alone so they can orbit around their own figure.
    Chameleons broadcast their `Q`/`E` body yaw and `pitch: 0`.
19. **The camera never leaves the arena.** `camera.ts` raycasts toward the desired
    position and pulls in to `hit.distance - 0.35`, floored at 1.4. Without it the
    camera walks through a wall and you find yourself looking at the arena from
    outside, which reads as the game having broken.
20. **Nothing that needs a held button may outlive the button coming up, and
    `pointerup` is not enough to guarantee that.** Release outside the window —
    which a right-drag flung past the edge of the screen does constantly — and
    the browser delivers the release to nobody: `orbiting` stayed true and the
    camera followed a bare cursor for the rest of the session, with another
    right-click the only way out. A stroke could strand the same way and keep
    painting. `onMouseMove` reads `e.buttons` first and clears both when it is
    zero, which is the *current* truth about the mouse rather than a memory of an
    event, so a lost release costs one frame. `pointercancel` is bound to the
    same handler as `pointerup` for the interruptions that never send one.
21. **A stroke in flight outranks every other meaning of the mouse.**
    `onMouseMove` checks `brushCursor.drawing` first, so pressing the right
    button mid-drag does not cancel the stroke and start orbiting.
22. **Remote transforms are damped, never snapped** — except on the very first
    frame, or a joining player flies in from the origin.
23. **The shotgun is rate-limited here as well as on the server.** `lastShot`
    against `FIRE_INTERVAL_MS`, checked before the raycast, so a held button is
    one shot. The client copy is for feel; the server's is what actually binds.
24. **A chameleon climbs, and never reorients while doing it.** There is no grab
    key: walking squarely into a wall takes you onto it. `W` and `S` then run up
    and down the face, `A`/`D` go across it, and `Space` is the only way off. The
    whole state is one vector — `cling`, the surface normal pointing back at the
    body — and the figure stays upright throughout. That constraint is what keeps
    the feature small: the camera, the poses and the `yaw` on the wire are all
    untouched by it. Do not be tempted to rotate the figure onto the surface
    without also rebuilding the camera basis, or `W` walks down the screen.
25. **On a wall, movement uses the wall's own axes, not the camera's.** `W` is up
    the face wherever you are looking, which is the whole point of `wallTangents`.
    On a *ceiling* there is no "up the surface", so movement falls back to
    ordinary camera-relative walking — which for a flat roof is exactly right.
26. **The probe reach depends on direction.** A chameleon is 0.26 wide and 1 tall, so
    one reach cannot serve both: an upward probe using the sideways reach would
    never see the ceiling their head is already touching, and a sideways probe
    using the vertical one would grab walls a body-length away. `reachFor` is the
    box's support function, and getting it wrong is why the first version could
    not wrap onto the ceiling at all.
27. **Clinging simply does not integrate gravity.** There is no `setGravityScale`
    any more and nothing to switch off: a climbing frame sets `vy = 0` and builds
    its whole desired movement from `alongSurface` plus a constant `STICK_SPEED`
    into the surface, which is what holds contact. The three cases — clinging,
    releasing, free — each own `vy` *as well as* the movement vector, and that
    exhaustiveness is the invariant. A fourth case that set the vector and forgot
    `vy` would float.
28. **Climbing off the top of something is not a special case.** The per-frame
    `holdsCling` ray simply misses, gravity comes back, and you drop the last few
    centimetres onto the top face. Losing the surface is already the "let go"
    path; reusing it is why there is no ledge-mantling code.
29. **`RECLING_GRACE` and a push on release.** Without both, `Space` lets go and
    the next frame walks you straight back into the wall you are still touching,
    so it appears to do nothing.
30. **One wrap rule covers every edge.** `wrapCling` probes whatever you are
    climbing *toward*; a face different from the one you hold becomes the new
    one. That is wall→ceiling, inside corners, and ceiling→wall, with no cases.
31. **Your own footsteps live in this file**, because it is the only place that
    knows you are grounded — nobody else's `grounded` is on the wire. They play
    without a position (you are the listener) and a little quieter than everyone
    else's. The `Stepper` is built with `strideFor(role)`, so a chameleon's cadence is
    quicker than a hunter's. Remote footsteps are `sound/SoundStage.tsx`.

## Contracts

- **Reads `world/Room.tsx`** for `ROOM_SURFACE`, and `world/surface.ts` for the
  revision counter that says when to look again. The list is rebuilt in the frame
  loop whenever that counter moves — a map finishing its load, or one map
  replacing another — because collecting once on mount silently produced an empty
  list for any map that suspends.
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
  collected once for shooting, the climb probes and the camera. Every surface in
  the arena is therefore climbable for free — walls, ceiling, all 25 obstacles,
  including the curved ones. Nothing had to opt in.
- **Climbing is chameleon-only in both places.** `Player.tsx` never sets `cling` for
  a hunter, and `server/room.ts` refuses the flag from one — the client for
  behaviour, the server because the flag's *effect* (silence) reaches everybody.
- **`cling` is broadcast** so other clients can keep a climber's footsteps quiet;
  their stepper only sees a position, and sliding along a wall looks exactly like
  walking. Nothing else about climbing goes on the wire, because the figure does
  not reorient — the existing `yaw` still describes it completely.
- **Owns the brush loop.** `createBrushCursor`'s `onDrawingChange` starts and
  stops it, and the pointer effect's teardown stops it again — a loop outlives the
  component that started it otherwise.

## The character controller is cached, and the cache has to be checked

`controller.ts` keys the controller off the world in a `WeakMap`, which looks
safe and is not on its own: **`useRapier().world` is a singleton proxy**, a
stable wrapper whose inner rapier world can be freed and rebuilt under it. The
`WeakMap` therefore survives that reset and returns a controller belonging to a
world that no longer exists — and the first `computeColliderMovement` on it
panics wasm with "attempted to take ownership of Rust value while it was
borrowed", poisoning the module so every later call throws "recursive use of an
object". Physics stops, the frame loop aborts and the canvas is lost. So the
cached controller is validated against `world.characterControllers` before it is
handed back, which is empty after a reset.

## The two controller settings that are off

`controller.ts` deliberately leaves both of rapier's headline conveniences
disabled, and each is one line away if the feel wants it — but neither is a free
win:

- **`enableAutostep`** would let a player walk up a step instead of jumping it.
  The arena is built on the opposite assumption: the stairs rise 0.9 a tread, the
  ziggurat is three 1-unit tiers, and `world/CLAUDE.md`'s "everything tall has a
  way up" was measured against a jump apex of ~3. Turning it on silently rewrites
  how the whole map is traversed.
- **`enableSnapToGround`** would keep the body glued to the floor over crests and
  down the 18° ramp. It also eats jumps unless it is disabled on the way up, and
  the small hop coming down the ramp is what the map already plays like.

## A chameleon has no name badge during the hunt

drei's `Html` is DOM drawn over the canvas, so it is **not occluded by
anything** — a label hovering above a hidden player is a marker drawn straight
*through* the wall they are behind, which hands the hunter every spot in the room
for free. `RemotePlayers` therefore drops the badge for chameleons while
`phase === "hunt"`.

Hunters keep theirs throughout: they are not hiding, and reading where the gun is
is most of what a chameleon has to play on. Badges come back for everyone at the
reveal, where naming the survivors is the entire point.

## `frozen` is not `paused`

A **paused** player has handed the game back: they see a menu, the mouse belongs
to it, and nothing in the world takes their input. A **frozen** one is still in
the game and can turn their head — they simply cannot go anywhere or paint.

It exists for the chameleons who survive a round. They *are* the reveal: lit red
through the walls so everybody can see the spot that beat them, and a spot they
walk away from is not a spot. Rooting them with `paused` would have been wrong in
both directions — a menu they did not ask for, and a locked-off camera for thirty
seconds as a reward for winning. So `frozen` reads as `NO_KEYS` in the frame loop
while every pointer handler stays live, and it refuses new strokes *and* cancels
one already in flight, since a drag begun a moment before the gong must not
repaint the body everybody has been asked to look at.

Hunters are never frozen: they are the ones walking over to look.

## The body is rebuilt on a room change *or* a role change

`Scene.tsx` keys `<Player>` on `` `${room}:${role}` ``. Crossing between a lobby
and its match rebuilds it for the reasons in the root doc; **being caught rebuilds
it for the same reasons without going anywhere.** A chameleon who becomes a
hunter needs the whole fresh start — back at the spawn point, upright, a hunter's
collider, a hunter's stride from `strideFor(role)` — and every one of those lives
in state or a ref inside this component. Nothing here has to detect a conversion;
the key does it.

## Not built yet

No prediction or reconciliation (the server never corrects you, it only clamps),
no footstep or collision sound, no crouch-walk or sprint. No coyote time: the
frame you leave a ledge is the frame you can no longer jump.

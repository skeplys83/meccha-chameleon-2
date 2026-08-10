# core — the shared vocabulary

**Owns:** the few definitions that more than one folder needs and none of them
owns. Nothing here imports from another game folder, and that is the rule that
keeps it from turning into a junk drawer.

**Entry points:** all three files, imported directly.

## Files

- `types.ts` — `Role`, `BODY` (collider half-extents per role), `Mark`.
- `palette.ts` — `PAINT`, the ten presets, and `SWATCHES`.
- `pointerLock.ts` — the shared canvas handle, `setLockTarget` / `requestLock` /
  `isLocked`.

## Invariants

1. **A hider's collider is narrower than their figure.** `[0.26, 1, 0.26]` —
   0.26 is the head radius from `figure/parts.ts`, so head, torso and legs are
   inside the box but shoulders and outflung arms are not. That is what lets a
   hider press into a wall and sink a shoulder in, instead of hovering a body's
   width off every surface in the room. The half-height is untouched, so the feet
   still land exactly on the floor. Two things follow from it: a folded pose's
   collider height is the `LOW_HALF` constant in `figure/poses.ts` and *not* `hx`
   (which would have squashed the crouch along with the width), and `ROOM_LIMIT`
   had to go to 19.9, because clamping a legitimately wall-hugging hider to 19
   showed everyone else a body floating off the wall.
2. **`palette.ts` has two consumers on purpose.** `paint/PaintPanel` renders it
   as the swatch row and `world/Room` paints nine of the arena's pieces in the
   same hexes. Camouflage is only testable if a preset is an *exact* match for
   something you can lie against, so these must never drift apart. White is the
   tenth — it is the room itself.
3. **The pointer-lock target is a module-level global for a reason.** The canvas
   is created inside the r3f tree; the pause menu and the paint panel live
   outside it. This is the handle both sides need.

## Contracts

- `players/` reads `BODY` for both the local collider and each remote figure's
  scale. `figure/` does not — it is built to a half-height of 1 and scaled by
  the caller.
- `hud/` and `players/` both read `Role`. Adding a third role means auditing
  every `role === "seeker"` in `players/Player.tsx` and `Game.tsx`, not just
  widening the union.

## Not built yet

`Mark` in `types.ts` and `NetMark` in `net/events.ts` are the same shape
declared twice — one is the render prop, one is the wire message. Harmless so
far, but they are a merge waiting to happen.

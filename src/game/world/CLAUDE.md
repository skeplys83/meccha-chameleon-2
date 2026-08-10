# world — the arena

**Owns:** the room everyone plays in: the shell, the twenty-five pieces of
cover, and the `ROOM_SURFACE` name that shots and the camera filter on.

**Entry points:** `Room`, `ROOM_SURFACE`, `ROOM_HALF`.

## Files

- `Room.tsx` — the local `Solid` helper and the layout, written as JSX rather
  than a position/size table because the pieces are no longer all boxes.

## Invariants

1. **Every surface must be named `ROOM_SURFACE`.** That name is what
   `players/Player.tsx` filters on for the shot raycast, the ground test and the
   camera pull-in. A new piece without it is shot straight through, cannot be
   stood on, and the camera clips into it. `Solid` sets it for you — hand-rolled
   geometry must not forget.
2. **A non-box shape must name the collider it needs.** `Solid`'s `colliders`
   prop goes to rapier's auto-generation: `cuboid` reads a bounding box (correct
   for boxes, including rotated ones like the ramp), `hull` wraps the real
   vertices (cylinders, cones, the crystal, the capsule), `ball` is the exact
   sphere, and the ring **must** be `trimesh` — a hull fills its hole in.
   Getting this wrong does not error; it just puts an invisible box around the
   piece.
3. **Everything tall has a way up.** Jump apex is `JUMP_SPEED²/2g` ≈ 3 units, so
   no step in the room is more than ~2: the ziggurat is three 1-unit tiers, the
   divider is a lip then a wall, the stairs rise 0.9 each onto a catwalk that
   dead-ends at the slab, and the big drum has a smaller drum beside it as its
   step. The cone, the capsule and the crystal are the deliberate exceptions — a
   hider who cannot reach the high ground has nowhere to hide but the corners.
4. **Nine pieces are painted in exact `PAINT` hexes.** Same table the swatch row
   renders. Pick the matching swatch, paint yourself, and you can test camouflage
   against a true match instead of eyeballing it. That is the whole point; do not
   "tidy" an arena colour to something off-palette.

## Contracts

- **Reads `ROOM_HALF` from `shared/protocol.ts`**, which `server/room.ts` also
  reads as `ROOM_LIMIT`. They describe the same bound and are no longer two
  constants — but they are deliberately *different numbers* (20 vs 19.9); see
  `shared/CLAUDE.md`.
- **Reads `PAINT` from `paint/palette.ts`.**
- `players/Player.tsx` collects `ROOM_SURFACE` meshes once from the scene graph
  on mount, because the room is static. If the arena ever gains pieces that
  appear or move at runtime, that collection has to become dynamic.
- `combat/Graves.tsx` deliberately does **not** use this name — a grave is paint
  on the floor and must not stop a bullet or the camera.

## Not built yet

The layout is fixed — no variants, no randomisation, no second map. The arena is
40×40×12 and lit by two plain lights in `Scene.tsx`.

# figure — the body everyone wears

**Owns:** the jointed stick figure, the poses it can hold, and the real
dimensions of every limb.

**Entry points:** `StickFigure`, `POSES` / `safePose` / `poseExtents`,
`PARTS` / `PART_SHAPE` / `Part`.

## Files

- `StickFigure.tsx` — the rig. Built to a half-height of 1 so callers scale it to
  a role's body size; origin at the middle of the body.
- `poses.ts` — the five poses as joint angles, plus the collider extents each
  one needs.
- `parts.ts` — `PARTS`, `Part`, `PART_SHAPE`.

**A figure can be drawn as a marker instead of a body.** `highlight` swaps every
part onto one flat unlit material with `depthTest` off, so it shows through
walls, and **pulses** it between a dark and a bright red; the reveal uses it on
the chameleons who survived a round. Three things about it are load-bearing:

- **Flat and unlit.** A shaded material would be lit like everything else and
  read as just another figure.
- **A high `renderOrder` goes with the disabled depth test**, because "ignores
  depth" only means "visible through walls" if you are the thing drawn last.
- **One shared material for every highlighted body in the scene.** It is
  animated, so a material per part per figure would be twelve times the colour
  writes for an identical result — and worse, they would drift out of phase and
  the pulse would stop reading as one deliberate signal. `pulseReveal` is
  idempotent so every figure may drive it.

It is attached through the mesh's `material` **prop**, and the paint material is
rendered only when `highlight` is false. The two must never both be present: a
child `<meshStandardMaterial>` attaches to `material` as well and, being applied
after props, silently wins.

It also hides the paint deliberately — camouflage is the thing being revealed,
and leaving it on would conceal the figure this exists to expose.

## Invariants

1. **Poses are joint angles on a rig, not separate models.** Limbs are groups
   pivoted at shoulder/elbow/hip/knee with the capsule hanging below, so a pose
   is a table of rotations: `x` swings forward (the figure faces −Z), `spread`
   swings out and is mirrored per side. Angles are damped every frame, so figures
   ease between poses instead of snapping.
2. **Index 0 is the upright stance** and is what everyone spawns in. A hunter
   never leaves it, so a rolled first-person camera is not a case that exists.
   The order is the order of the number keys: stand, crumple, lie on your side,
   arms up, sit.
3. **A pose's `roll` is animated here; the collider only gets the end state.**
   The rigid body has rotations frozen, so `players/Player.tsx` gives the
   collider the finished quaternion via `setRotationWrtParent` while the visual
   group carries only yaw. Both have to change together or the body and its box
   part company mid-animation.
4. **`PART_SHAPE` is the single source of truth for two different consumers.**
   `StickFigure` builds its capsule geometry from it and `paint/skin.ts` derives
   the brush ellipse from it. That is why it is its own file rather than a
   private constant: a part's texture wraps its circumference, so if the two ever
   disagreed the brush would silently paint the wrong size — far bigger on the
   head than on a forearm. Change a radius and both follow.
5. **`LOW_HALF` is a constant, not `hx`.** A folded pose's collider half-height
   is 0.4. Tying it to how *wide* the body is meant that narrowing the chameleon (so
   they could sink into walls) also squashed their crouch to nothing.
6. **`safePose` guards everything off the wire.** A pose index arrives from the
   network on every patch; an out-of-range one must clamp, not index into
   `undefined`.

## Contracts

- **`POSE_COUNT` comes from `shared/protocol.ts`** and `poses.ts` **throws at
  import time** if the table's length disagrees with it. Adding a pose means
  editing both in the same change — the build will stop you otherwise. The
  server clamps incoming pose indices against the same number, and
  `players/controls.ts` builds one key binding per entry.
- `players/` passes `pose` as a plain number for the local player and as a
  *getter* for remotes, whose pose changes on network patches that deliberately
  do not re-render the tree.
- `combat/` supplies the `aim` and `holding` props: on a remote hunter the right
  arm leaves the pose entirely and points along the aim
  (`x = π/2 + pitch`, yaw already being the figure's rotation), with the shotgun
  in that hand.
- `paint/skin.ts` is asked for each part's texture via `getSkin(skinId)`. Every
  mesh carries `userData.part`, which is what makes the paint raycast able to
  tell which canvas to draw into.

## Not built yet

No animation beyond pose damping — no walk cycle, no idle. Both roles render as
the same white figure, distinguished only by size and the gun; that is
deliberate and was asked for explicitly. There is no red/blue tint any more.

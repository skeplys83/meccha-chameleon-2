# figure — the body everyone wears

**Owns:** the skinned character everyone wears and the poses it can hold.

**Entry points:** `StickFigure`, `POSES` / `safePose` / `poseExtents`,
`preloadCharacter`.

## Files

- `StickFigure.tsx` — the React half: builds one body, wears the player's paint,
  eases the pose angles, and hangs the shotgun off the hand bone. Built to a
  half-height of 1 so callers scale it to a role's body size; origin at the
  middle of the body.
- `model.ts` — loading `public/models/player.glb` once and cloning a body
  (with its own skeleton) per figure, and the 14 bone names.
- `rig.ts` — writing a pose onto a skeleton. **The one file here with no React
  in it**, which is what lets the pose maths be run against the real `.glb`
  outside a browser.
- `poses.ts` — the five poses as joint angles, plus the collider extents each
  one needs. Three of them were **fitted** to the sculpts in
  `characters/figure-poses.blend`, which holds hand-modelled figures kept as
  *reference only* — they have no rig and nothing under `src/` reads a `.blend`.
  The one that **is** rigged, the star, is what `public/models/player.glb` was
  cut down from, and its bind pose is why `star` needed no fitting at all.

**A figure can be drawn as a marker instead of a body.** `highlight` swaps the
body onto one flat unlit material with `depthTest` off, so it shows through
walls, and **pulses its opacity** between almost-gone and solid red; the reveal uses it on
the chameleons who survived a round. Three things about it are load-bearing:

- **Both layers are unlit.** The paint is a *colour match* against a surface, so
  showing it shaded would misrepresent the exact thing being judged — and a lit
  red would read as just another figure rather than a marker.
- **Both layers ignore depth**, so a survivor shows through the wall they hid
  behind. That needs `depthWrite: false` alongside `depthTest: false`, or the
  parts of one body punch holes in each other through a depth buffer they are not
  consulting, and it needs the overlay one `renderOrder` above the paint —
  "ignores depth" means "whatever is drawn last wins".
- **The overlay never takes a raycast.** It is a second mesh sitting exactly on
  the body, so without a `raycast` that returns nothing a shot would hit the
  marker rather than the player.
- **The overlay shares the body's skeleton rather than getting its own.** It is
  a second `SkinnedMesh` bound to the same one, so it follows every pose for
  free; posing it separately would be twice the work for a guaranteed-identical
  answer, and any drift between the two would show as red bleeding off a limb.
- **A high `renderOrder` goes with the disabled depth test**, because "ignores
  depth" only means "visible through walls" if you are the thing drawn last.
- **One shared red material for every highlighted body in the scene.** It is
  animated, so a material per part per figure would be twelve times the opacity
  writes for an identical result — and worse, they would drift out of phase and
  the pulse would stop reading as one deliberate signal. `pulseReveal` is
  idempotent so every figure may drive it. The *paint* material is per figure,
  because each body wears its own canvas.

## Invariants

1. **Poses are joint angles, not separate models.** A pose is a table of
   rotations: `x` swings forward (the figure faces −Z), `spread` swings out and
   is mirrored per side. Angles are damped every frame, so figures ease between
   poses instead of snapping. The table did not change when the body became a
   skinned mesh, and it should not have to: `rig.ts` turns those angles into
   bone rotations, and the angles stay the readable, editable thing.
   **`x` and `spread` are a direction, not Euler angles on a bone.** For a limb
   `rig.ts` works out where the bone's own axis should point *in the figure's
   frame*, converts that into the parent bone's frame, and solves for the swing
   that gets there. That is why a bone's rest orientation — which is different
   for all fourteen of them — never has to be written down anywhere.
2. **Index 0 is the upright stance** and is what everyone spawns in. A hunter
   never leaves it, so a rolled first-person camera is not a case that exists.
   The order is the order of the number keys: stand, reach up, star jump, lie
   flat, curl up — loosest first, so the two that fold the body are last. **Five, down from nine** — the other four were cut rather than
   fixed, because a pose that does not read at a glance is not worth a key.
   **Every pose is left-right symmetric, and that is now a property of the
   *table* rather than of the rig.** A `Pose` carries one `Joint` per joint
   *pair* and it is applied as `spread * side`, so there is no way to write one
   leg forward and the other trailing — a leap was dropped from the poses taken
   off the sculpts for exactly this reason. The machinery underneath no longer
   has that limit: `Angles` in `rig.ts` holds every joint as `[left, right]`,
   which is what the aiming arm already uses. **A walk cycle needs a richer
   `Pose`, not a richer rig.**
3. **A pose's `roll` is animated here; the collider only gets the end state.**
   The rigid body has rotations frozen, so `players/Player.tsx` gives the
   collider the finished quaternion via `setRotationWrtParent` while the visual
   group carries only yaw. Both have to change together or the body and its box
   part company mid-animation.
4. **One model, one unwrap, one texture — and the game measures itself against
   it.** The body is a single skinned mesh wearing a single continuous unwrap
   authored in Blender, so there is no per-part geometry, no atlas and no cell
   lookup: a hit's own UV says where on the body the brush landed. The game
   holds no measurement of that unwrap at all — `paint/surface.ts` works in the
   body's own units — so re-unwrapping the model needs no matching change here.

   This replaced a 4×3 atlas of per-part cells, which is worth recording because
   it failed in a way that was hard to see: assigning UVs per *face* left 160 of
   3,000 triangles straddling two cells, each smearing a swath of the texture
   across itself, concentrated at the shoulders, hips and neck. The measurement
   that showed it — the ratio of a triangle's UV span to its 3D span — is the one
   to reach for if painting ever looks torn again.
5. **`LOW_HALF` is a constant, not `hx`.** A folded pose's collider half-height
   is 0.4. Tying it to how *wide* the body is meant that narrowing the chameleon (so
   they could sink into walls) also squashed their crouch to nothing.
6. **`safePose` guards everything off the wire.** A pose index arrives from the
   network on every patch; an out-of-range one must clamp, not index into
   `undefined`.

7. **The body is one mesh and `userData.body` is how paint finds it.** There is
   nothing per-part to raycast or name.
8. **The rig ends at the forearm.** There is no hand bone and no root bone —
   `Spine1` is the root, and the shotgun hangs off `LowerArmR`, pushed down that
   bone's own axis by `FOREARM_LENGTH`. If the rig ever gains a hand bone, the
   offset goes away and the grip parents to it instead.
9. **A pose is composed onto a bone's rest rotation, never written over it.**
   The rig is bound in the star pose, so a bone's rest rotation is most of where
   its limb already points. Overwriting it folds the body inside out — which is
   not a subtle failure, and is worth recognising on sight.
10. **Two bones are leaned rather than aimed.** `Spine1` runs *downward* from
    the waist, so aiming it at the sky folds the figure in half; the head
    already points where it should. Both turn about the figure's own left-right
    axis instead, the head on top of whatever the torso did.
11. **The arms ride the torso's lean and the legs do not.** That was structural
    in the old jointed rig — the legs hung outside the torso group. On a
    skeleton the legs hang off the very bone the lean is written onto, so it is
    kept deliberately: a limb's target is stated in the figure's frame and
    divided back through its parent's rotation, which cancels the spine unless
    the target asks for it.
12. **The skeleton sits inside a node the exporter rotated**, to stand a Z-up
    model up in a Y-up world. The bone chain therefore starts from that node's
    rotation rather than from nothing. Miss it and every target is solved in a
    frame tipped on its side — the figure poses itself confidently into
    nonsense.
13. **Nothing here suspends.** The model is fetched imperatively and a figure
    renders nothing until it lands. `StickFigure` sits inside the player's
    collider, and a suspending component tears its whole subtree down — which is
    the same hazard `world/` documents as its invariant 8, with rapier panicking
    rather than recovering.

14. **The angles are fitted to the sculpts, not eyeballed — and the first set
    was eyeballed, which is why they were wrong.** The original table was authored
    against the *old procedural capsule figure*, whose proportions and hip
    placement differ from the model: measuring this rig's own bind pose gives a
    shoulder spread of 2.12 and a hip spread of 0.81 where the old `star` entry
    said 2.36 and 0.44. Numbers that describe one body do not transfer to
    another, and on screen that reads as poses that are subtly, uniformly wrong.

    The fit runs in Blender over the *pose parameters themselves* — the ten
    numbers a `Pose` carries — rather than over bone rotations. That is the whole
    trick: the parameterisation can only express anatomically sane, symmetric
    poses, so the optimiser cannot thread a limb through the torso to satisfy a
    surface distance, which is exactly what fitting bone rotations directly did.

    **Two mistakes cost a day between them, and both look like a bad model.**
    Fitting in a frame that includes the alignment transform aims every limb in
    the *target's* rotated frame instead of the figure's own — the fix is to pose
    in figure space and apply the alignment afterwards, as `rig.ts` does. And a
    target measured in Blender units against a model in game units is a 28×
    mismatch that still "converges", just to nonsense.

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
  in that hand. **`holding` is portalled onto the `LowerArmR` bone**, so it is
  carried by the skeleton and needs no frame callback of its own — see
  invariant 8 for why it is the forearm rather than a hand.
- `paint/skin.ts` is asked for the body's one texture via `getSkin(skinId)`.
  The mesh carries `userData.body`; the hit's UV needs no translation.
- **`Game.tsx` calls `preloadCharacter()` on the join click**, next to the
  sounds. A figure that mounts before it lands still gets a body — it awaits the
  same idempotent promise — but nothing should rely on that: the point of the
  early call is that no one ever watches a body appear.

## Not built yet

**No animation beyond pose damping — no walk cycle, no idle, and no clips.** The
model is skinned and the rig can carry all of it; what is missing is a `Pose`
rich enough to say "left leg forward, right leg back" (invariant 2) and somewhere
for a cycle's phase to live. The `.glb` carries no animation tracks today, so a
walk authored in Blender would arrive as clips for three's `AnimationMixer` and
would need deciding against this angle-driven path rather than beside it.

Both roles render as the same white figure, distinguished only by size and the
gun; that is deliberate and was asked for explicitly. There is no red/blue tint
any more.

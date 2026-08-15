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
  one needs. Three of them were **fitted** to the sculpts in the `reference`
  collection of `characters/figure-poses.blend`, which are hand-modelled and
  kept as *reference only* — they have no rig and nothing under `src/` reads a
  `.blend`. The rigged body is in that file's `export` collection, bound in the
  star pose, which is why `star` needed no fitting at all.

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
   is mirrored per side, `twist` rolls about the joint's own axis and is
   mirrored too. Angles are damped every frame, so figures ease between
   poses instead of snapping. The table did not change when the body became a
   skinned mesh, and it should not have to: `rig.ts` turns those angles into
   bone rotations, and the angles stay the readable, editable thing.
   **All fourteen bones are dialable from `poses.ts`**, as twelve entries: the
   four singles `torso` / `chest` / `neck` / `head`, the three arm joints
   `clavicle` / `shoulder` / `elbow` **once per side**, and the two leg joints
   `hip` / `knee` mirrored across both. Each carries the same three numbers. Adding those knobs moved no existing figure by more than 3e-6
   (checked in Node against the real `.glb`, old rig beside new).

   **Nothing in a `Pose` is optional, and every pose writes every number out,
   zeros included.** The table is a dial board rather than a diff against a
   default: a joint nobody has thought about should not be indistinguishable
   from one deliberately left at rest, and the compiler is what keeps the next
   pose complete. Zero is the bind rotation either way, so this changed no
   figure at all — verified field by field against the previous table. What it
   costs is being able to see at a glance which joints a pose *moves*, and that
   comes back in the developer readout, which dims every angle sitting at zero.
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
   **The arms are per side; the legs are still a mirrored pair.** `clavicle`,
   `shoulder` and `elbow` each carry a `left` and a `right`, so one arm can
   reach while the other hangs. `hip` and `knee` are one `Joint` applied to
   both legs, which is why there is still no way to write one leg forward and
   the other trailing — a leap was dropped from the poses taken off the sculpts
   for exactly that reason, and a walk cycle needs the same split made twice
   more. Nothing under the table has ever had the limit: `Angles` in `rig.ts`
   holds every joint as `[left, right]`, which is what the aiming arm uses.

   **`spread` and `twist` stay *outward* on both sides**, mirrored by
   `* side` in `StickFigure` — so the same number means the same thing left and
   right, a symmetric pair is two identical `Joint`s, and crossing a limb over
   the body is a negative spread on that side. `x` is not mirrored: forward is
   forward for both. Splitting the arms was a pure widening — every shipped
   pose still has `left === right` on all three arm joints, checked.
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
5. **`LOW_HALF` is a whole box, and none of it comes from the role.** A folded
   pose is *lying down*: the curl measures 0.76 × 0.76 × 1.10, so its collider is
   `[0.28, 0.38, 0.42]` rather than the chameleon's own 0.12-wide post cut short.
   The post was a body with effectively no collision — you could stand a curled
   player inside a table. Tying any of it to `hx` is the older mistake:
   narrowing the chameleon so they could sink into walls also squashed their
   crouch to nothing.
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
10. **Six bones are leaned rather than aimed, and a lean's sign is the
    opposite of a limb's.** `Spine1` runs *downward* from the waist, so aiming it
    at the sky folds the figure in half; the head already points where it should,
    and a collar bone points sideways. `Spine1`, `Spine1001`, `Neck`, `Head` and
    the two `Shoulder`s therefore turn about the figure's own axes instead —
    `x` pitches, `twist` yaws, `spread` tilts sideways — each stacked on
    whatever the one below it did. A lean is identity at zero, which is what
    makes a bone nobody dials cost nothing, and it is stated in the figure's
    frame by conjugating with the parent's accumulated rotation (the old
    single-axis form did the same thing by rotating the axis instead).

    **The trap: a positive `x` swings a *limb* forward and leans the *spine*
    backward.** A lean is `setFromAxisAngle(+X, x)`, which carries the torso's up
    axis toward +Z, and the figure faces −Z. Every folded pose written before
    this was noticed had its top half arching backwards over legs reaching
    forwards — a body sprawled open, which is the exact opposite of the pose it
    claimed to be, and which reads in game as a long noodle rather than as a
    mistake. Check a new lean against `torso: { x: 1.5 }`, which puts the head
    bone at z ≈ +0.63, i.e. behind the pelvis.
11. **The arms ride the two spine leans and the legs do not.** That was structural
    in the old jointed rig — the legs hung outside the torso group. On a
    skeleton the legs hang off the very bone the lean is written onto, so it is
    kept deliberately: a limb's target is stated in the figure's frame and
    divided back through its parent's rotation, which cancels the spine unless
    the target asks for it — `target()` names `torso` and `chest` and nothing
    else. The same cancelling is why **a collar bone moves where an arm starts,
    never where it points**: a shrug carries the shoulder joint 0.1 across and
    the arm still aims where the pose put it. It does change the arm's *roll*
    about its own axis, since a swing solved in a rolled parent frame arrives
    rolled; `shoulder.twist` is the knob for taking that back.
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

15. **A folded pose is *solved* where it can be and eyeballed where it cannot,
    and fitting it to the sculpt is neither.** Chamfer distance against
    `pose_6_curl_ball` scores a body sprawled open as well as it scores a ball —
    a big arched figure still has surface near a blob everywhere it matters to
    the average — so every automatic best-fit run against that sculpt came out
    worse than a pose set by hand. What does work is measuring the rig and
    solving the one or two angles that have a *definition*: `torso.x = −π/2` is
    the value that puts the waist→neck line exactly horizontal, which is what
    "the body is level" means and is not a number anybody would land on by eye
    (the lean is measured from a bone that runs *downward*, so level is a
    quarter-turn, not a half). The rest is chosen against renders.

    **Compare renders from the side.** A fold happens in the front-back axis, so
    a front view hides the whole error — it will happily show a compact ball that
    is a metre long from the side, which is how two wrong curls shipped. Pose the
    real `.glb` in Node through the real `rig.ts`, write the vertices out, and
    look at them in Blender beside the sculpt.

16. **A pose that folds the body must be put back onto its collider.**
    The body's origin is the collider's centre, so the figure's feet land at the
    collider's bottom edge by construction — true for every pose that keeps the
    legs under it, and false the moment they come up. `curl` bottoms out 0.59
    below the origin, and reaches 0.30 *forward* of it as well — a level torso is
    half a metre of body hanging off the front of the pelvis.
    So a folded pose carries `offsetY` **and `offsetZ`**, which shift the whole
    figure back onto its collider; the curl's are 0.21 and 0.30, and with them
    the posed body's own bounding box is centred on the origin to within 0.01 in
    every axis. Both are damped with everything else, so they arrive as the pose
    folds. They are also what keeps the camera honest — `players/CLAUDE.md` aims
    at the origin precisely because every pose is centred on it.

17. **`Spine1001` is not a second spine bend, and driving it is wasted work.**
    It sits at *exactly* the same origin as `Spine1` — both at (0, 0.03, −0.01),
    measured — so a rotation written onto it turns the upper body about the same
    pivot the torso lean already uses. It composes; it does not curve. The rig
    is one rigid 0.43-long segment from waist to neck plus a 0.22 head, and a
    pose has to be built within that. It is dialable as `chest` — every bone is —
    but that knob composes with `torso` rather than bending anything, and the
    curl deliberately does not use it. **A genuine C-curve needs a bone between
    the two in Blender, not a number here.**

18. **A twist is applied inside the rest rotation; an aim is applied outside
    it.** A limb's `twist` turns the bone about its own length — local +Y, which
    is where Blender points a bone and what `restDir` already reads — so it goes
    on as `swing * rest * twist`, leaving the limb pointing exactly where the aim
    put it and rolling only what hangs off it and what is painted on it.
    Composing it the other way would swing the limb instead, which is a twist
    that moves the hand and is not what the word means. A leaning bone has no
    `twist` of its own: yaw is already one of its three axes.

19. **The `.glb` carries the rig's *object* transform, and getting it wrong
    makes the character invisible rather than wrong-looking.** glTF writes the
    armature object's location, rotation and scale as the root node — it does
    not bake them away — so whatever the rig is sitting on in Blender is where
    every player's body is drawn. A re-export with the armature parked 138 units
    off the origin put every figure 138 metres from its collider: name badges,
    footsteps, shots and collision all worked, and there was simply no body
    anywhere near the player. **An invisible character is a transform, not a
    missing mesh** — check this before anything else, because the file loads and
    validates perfectly.

    The same export was also yawed 90°, which is the *other* half of the same
    lesson: Blender +Z is glTF +Y, so a rotation about Blender's Z is a yaw in
    game, and a body facing sideways is a figure whose arms spread along the
    axis it walks down.

    Four things the export must satisfy, all of them measurable in Node against
    the `.glb` with no browser (see `docs/VERIFYING.md`):

    - **The standing pose is exactly 2 units tall and centred on the origin.**
      Half-height 1, because `players/Player.tsx` scales the body by the role's
      collider half-height — that is what makes invariant 16's "the feet land at
      the collider's bottom edge" true. It is the *stand* pose that has to
      measure 2, not the bind star, and the two differ: the current export is
      1.896 in bind and 2.000 standing. The old one was 2.047 standing, so the
      feet always sank a little; they no longer do.
    - **Arms spread along X, depth along Z, and the figure faces −Z.** The bind
      star measures 1.76 × 1.90 × 0.40 (x, y, z); if x and z are swapped the rig
      is yawed.
    - **14 bones, named as `model.ts` lists them.** glTF strips Blender's dots,
      so `Spine1.001` arrives as `Spine1001`.
    - **One skinned mesh, with `uv` and an index.** `paint/surface.ts` and
      `paint/pick.ts` both need them, and `figure/model.ts` returns null without
      a skinned mesh — which renders nothing, invisibly, exactly like a bad
      transform.

    The cheapest check on a new export is against the old one: the bone rest
    positions should differ only where the rig was deliberately changed. That is
    what found the 90° — three of the four yaw candidates aligned an order of
    magnitude worse than the fourth.

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
model is skinned and the rig can carry all of it; what is missing is `hip` and
`knee` split per side the way the arms already are (invariant 2) and somewhere
for a cycle's phase to live. The `.glb` carries no animation tracks today, so a
walk authored in Blender would arrive as clips for three's `AnimationMixer` and
would need deciding against this angle-driven path rather than beside it.

Both roles render as the same white figure, distinguished only by size and the
gun; that is deliberate and was asked for explicitly. There is no red/blue tint
any more.

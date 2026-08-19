# figure — the body everyone wears

**Owns:** the rig, the poses, the one model, and `PART_SHAPE` (what each limb
is, for the brush).

## What's here

| file               | what                                                     |
| ------------------ | -------------------------------------------------------- |
| `StickFigure.tsx`  | one posed, painted body                                  |
| `poses.ts`         | `POSES`: the joint-angle table, and each pose's own box  |
| `rig.ts`           | bone names, rest rotations, and how an angle is applied  |
| `model.ts`         | fetching `player.glb`, imperatively                      |
| `samples.ts`       | points on the body, for the buried-fraction probe        |

## The three rules that will bite you

1. **Poses are joint angles, not separate models.** There is one mesh, one
   unwrap and one texture — which is what makes paint survive a pose change.
   Adding a pose means adding a row to `POSES`, never adding a file.
2. **Every pose states its own whole box, in the axes the box ends up in.** A
   lying pose's box is stated lying down. `players/Player.tsx` rebuilds the
   collider from it and puts the *underside* back where it was; a pose whose box
   is wrong is one that sinks into the floor or floats above it.
3. **A pose is composed onto a bone's rest rotation, never written over it.**
   The rig comes out of Blender with meaningful rest rotations and the skeleton
   sits inside a node the exporter rotated to stand a Z-up model up. Overwriting
   rather than composing gives you a body folded inside out, and the failure
   looks like a bad angle rather than a bad operation.

## Contracts

- **`POSE_COUNT` lives in `shared/protocol.ts`** and `poses.ts` throws on import
  if its table disagrees, so the two can never drift.
- **`safePose` guards everything off the wire.**
- **Nothing here suspends.** The model is fetched imperatively and a figure
  draws nothing until it lands — suspending would tear down the collider it
  sits inside.
- **`paint/` reads the real limb sizes from here**, and this folder reads the
  canvases from `paint/skin.ts`. Known, acyclic at the module level.

---

Twenty invariants, the fitting method, and the Blender export geometry:
[docs/notes/figure.md](../../../docs/notes/figure.md).

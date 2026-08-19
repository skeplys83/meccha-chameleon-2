import * as THREE from "three";
import type { RapierRigidBody, useRapier } from "@react-three/rapier";
import { bodySamples, makeSampleBuffer } from "@/client/figure/samples";

/** Scratch for the probe, which is developer mode only. */
const probeBuffer = makeSampleBuffer();

/**
 * What share of the posed body is inside solid geometry — 0 for a player
 * standing in the open, 1 for one entirely swallowed by a wall.
 *
 * **Developer mode only, and a readout rather than a rule.** Nothing acts on
 * it; it is here to be watched while deciding what a fair depth is. The
 * collider is deliberately smaller than the body (`body.ts`), so *some* of this
 * is the hiding mechanic working — the question it exists to answer is how much
 * is too much.
 *
 * **The player's own rigid body is excluded, and that is not optional.** The
 * sample points are on the body, and the body wears a collider — so without the
 * filter a chameleon standing alone in an empty hall reads 58%, which is simply
 * the fraction of their own skin inside their own box.
 *
 * Rapier's point query, so it sees every `col_*` the map defines without a
 * second list. **A `coltri_*` is hollow** — a trimesh has no interior — so
 * points inside one read as outside and the number under-counts near those.
 * The dungeon has 17 of them against ~540 solid ones.
 */
export function buriedFraction(
  world: ReturnType<typeof useRapier>["world"],
  mesh: THREE.SkinnedMesh,
  self: RapierRigidBody,
) {
  const count = bodySamples(mesh, probeBuffer);
  if (count === 0) return 0;
  let inside = 0;
  for (let i = 0; i < count; i++) {
    let hit = false;
    world.intersectionsWithPoint(
      probeBuffer[i],
      () => {
        hit = true;
        return false; // stop at the first — we want whether, not which
      },
      undefined,
      undefined,
      undefined,
      self,
    );
    if (hit) inside += 1;
  }
  return inside / count;
}

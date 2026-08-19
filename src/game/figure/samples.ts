import * as THREE from "three";

/**
 * Points spread over the *skin* of a posed body, for asking how much of a
 * player is inside something. **Developer mode only** — nothing in the game
 * reads this, and every use is behind `DEV`, which is what keeps it out of
 * `dist/`.
 *
 * **Sampled off the live figure, not off a table.** The body standing in the
 * scene is already skinned, already posed and already eased into whatever it is
 * holding, so reading it is both the cheapest and the most honest answer — a
 * baked table would have to repeat the pose maths, would go stale the moment a
 * joint angle changed, and would describe the pose being eased *toward* rather
 * than the one on screen. `three` skins a vertex for us with
 * `SkinnedMesh.getVertexPosition`, which is the whole trick.
 *
 * **Surface points, not bones**, because the question is what share of the body
 * is buried and the body is a surface. Bone heads cluster in the torso and would
 * make a figure with its arms in a wall read as barely covered.
 */

/** How many points to spread over the body. Enough that a percentage moves
 *  smoothly; small enough that the point queries behind them are noise. */
const SAMPLE_COUNT = 192;

/** Vertex indices to sample, chosen once per geometry — the mesh is cloned per
 *  figure but the geometry behind it is shared, so this is computed once. */
const chosen = new WeakMap<THREE.BufferGeometry, Uint32Array>();

/**
 * Pick vertices spread over the body **by surface area**, so a hand does not
 * carry the same weight as the whole torso just because it is finely tessellated
 * there. Area is measured in the bind pose; posing moves the vertices but does
 * not change which parts of the body are big.
 */
function pickVertices(geometry: THREE.BufferGeometry): Uint32Array {
  const cached = chosen.get(geometry);
  if (cached) return cached;

  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = position.count;
  const weight = new Float64Array(count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  const triangles = index ? index.count : count;
  for (let t = 0; t < triangles; t += 3) {
    const i0 = index ? index.getX(t) : t;
    const i1 = index ? index.getX(t + 1) : t + 1;
    const i2 = index ? index.getX(t + 2) : t + 2;
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    weight[i0] += area;
    weight[i1] += area;
    weight[i2] += area;
  }

  // Walk the running total in equal steps. Deterministic, evenly spread, and no
  // random number generator to seed — the same body always samples the same way,
  // so the readout does not shimmer while a player stands still.
  let total = 0;
  for (let i = 0; i < count; i++) total += weight[i];
  const picked = new Uint32Array(SAMPLE_COUNT);
  const step = total / SAMPLE_COUNT;
  let target = step / 2;
  let running = 0;
  let at = 0;
  for (let i = 0; i < count && at < SAMPLE_COUNT; i++) {
    running += weight[i];
    while (running >= target && at < SAMPLE_COUNT) {
      picked[at++] = i;
      target += step;
    }
  }
  // A degenerate tail (zero-area vertices at the very end) leaves slots unfilled.
  for (; at < SAMPLE_COUNT; at++) picked[at] = count - 1;

  chosen.set(geometry, picked);
  return picked;
}

/**
 * Fill `out` with the **world positions** of `SAMPLE_COUNT` points on the body,
 * as it is posed this frame. Returns how many were written.
 *
 * The caller supplies the array so nothing is allocated per sample.
 */
export function bodySamples(mesh: THREE.SkinnedMesh, out: THREE.Vector3[]): number {
  const picked = pickVertices(mesh.geometry);
  for (let i = 0; i < picked.length; i++) {
    mesh.getVertexPosition(picked[i], out[i]);
    out[i].applyMatrix4(mesh.matrixWorld);
  }
  return picked.length;
}

/**
 * The one skinned body inside a subtree, found the way `paint/` finds it —
 * `userData.body`, set in `StickFigure`. Null before the model has arrived, and
 * for a first-person hunter, who is not rendering a figure at all.
 */
export function findBody(root: THREE.Object3D | null): THREE.SkinnedMesh | null {
  if (!root) return null;
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!found && mesh.isSkinnedMesh && mesh.userData.body) found = mesh;
  });
  return found;
}

/** Somewhere for a caller to keep its scratch. */
export const makeSampleBuffer = () =>
  Array.from({ length: SAMPLE_COUNT }, () => new THREE.Vector3());

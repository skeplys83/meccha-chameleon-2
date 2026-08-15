import * as THREE from "three";

/**
 * Finding the point on your own body under the cursor, without paying three's
 * skinned raycast.
 *
 * **`SkinnedMesh.raycast` re-skins the model for every ray, three times per
 * triangle.** It walks the index buffer and calls `applyBoneTransform` on each
 * vertex of each triangle as it tests it — 28,692 bone transforms for this
 * body's 9,564 triangles — and it does that again for the next ray. Measured on
 * `player.glb`: **6.15 ms per ray**, whether it hits or misses. That is a third
 * of a frame for one mouse move, and `brushCursor`'s tolerant search fires up to
 * 25 rays when a drag runs off a limb: **~153 ms**, which is a visible freeze
 * rather than a slow frame.
 *
 * The fix is to separate the two halves. Skinning depends on the pose, not on
 * the ray, so it is done **once** — per vertex rather than per triangle corner,
 * which is 5,745 transforms instead of 28,692 — and cached. Every ray after
 * that is a plain triangle sweep over a flat `Float32Array`, with the posed
 * bounding box rejecting anything that misses the body entirely.
 *
 * Nothing here is paint-specific except where it lives; `combat/shoot.ts` still
 * uses three's raycast, because a shot happens twice a second at most.
 */

/**
 * How long a skinned snapshot is reused, in milliseconds. One frame at 120 Hz,
 * so a gesture's worth of rays share one pass and a walking, posing player is
 * never picked against a body more than a frame stale — which is less than the
 * distance the cursor moves between two mouse events anyway.
 */
const MAX_AGE_MS = 8;

type Posed = {
  /** World-space vertex positions, in the geometry's own vertex order. */
  positions: Float32Array;
  box: THREE.Box3;
  at: number;
};

const posed = new WeakMap<THREE.SkinnedMesh, Posed>();

const vertex = new THREE.Vector3();
const edge1 = new THREE.Vector3();
const edge2 = new THREE.Vector3();
const pvec = new THREE.Vector3();
const tvec = new THREE.Vector3();
const qvec = new THREE.Vector3();

/** The body as it is posed *now*, skinned once and kept for `MAX_AGE_MS`. */
function poseOf(mesh: THREE.SkinnedMesh): Posed {
  const cached = posed.get(mesh);
  const now = performance.now();
  if (cached && now - cached.at < MAX_AGE_MS) return cached;

  const attribute = mesh.geometry.attributes.position;
  const positions = cached?.positions ?? new Float32Array(attribute.count * 3);
  const box = cached?.box ?? new THREE.Box3();
  box.makeEmpty();

  for (let i = 0; i < attribute.count; i++) {
    vertex.fromBufferAttribute(attribute, i);
    // Bind pose → posed, then posed → world. The skeleton's matrices are from
    // the last render, which is the same frame the cursor is being read against.
    mesh.applyBoneTransform(i, vertex);
    vertex.applyMatrix4(mesh.matrixWorld);
    positions[i * 3] = vertex.x;
    positions[i * 3 + 1] = vertex.y;
    positions[i * 3 + 2] = vertex.z;
    box.expandByPoint(vertex);
  }

  const next = cached ?? ({ positions, box } as Posed);
  next.positions = positions;
  next.box = box;
  next.at = now;
  posed.set(mesh, next);
  return next;
}

export type BodyHit = {
  /** Where on the unwrap the ray landed — what a stroke is written in. */
  u: number;
  v: number;
  /** World space, both of them. */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
};

/** One shared result, valid until the next call. A pick is read immediately by
 *  the only caller there is, and a gesture fires up to 25 of them. */
const result: BodyHit = {
  u: 0,
  v: 0,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: 0,
};

/** Barely-not-zero, for the determinant that says a ray is parallel to a face. */
const EPSILON = 1e-10;

/**
 * The nearest front face of `mesh` along `ray`, or null.
 *
 * Front faces only, matching three's default `FrontSide` material: without that
 * a cursor over an arm would sometimes pick the inside of the chest behind it.
 */
export function pickBody(mesh: THREE.SkinnedMesh, ray: THREE.Ray): BodyHit | null {
  const { positions, box } = poseOf(mesh);
  if (!ray.intersectsBox(box)) return null;

  const index = mesh.geometry.index;
  const uv = mesh.geometry.attributes.uv;
  if (!index || !uv) return null;

  const tri = index.array;
  const count = tri.length / 3;
  let bestT = Infinity;
  let bestTri = -1;
  let bestU = 0;
  let bestV = 0;

  const { origin, direction } = ray;

  for (let t = 0; t < count; t++) {
    const a = tri[t * 3] * 3;
    const b = tri[t * 3 + 1] * 3;
    const c = tri[t * 3 + 2] * 3;

    // Möller–Trumbore, with the culling branch: a negative determinant is a
    // face pointing away, and those are the ones `FrontSide` discards.
    edge1.set(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
    edge2.set(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
    pvec.crossVectors(direction, edge2);
    const det = edge1.dot(pvec);
    if (det < EPSILON) continue;

    tvec.set(origin.x - positions[a], origin.y - positions[a + 1], origin.z - positions[a + 2]);
    const u = tvec.dot(pvec);
    if (u < 0 || u > det) continue;

    qvec.crossVectors(tvec, edge1);
    const v = direction.dot(qvec);
    if (v < 0 || u + v > det) continue;

    const distance = edge2.dot(qvec) / det;
    if (distance <= 0 || distance >= bestT) continue;

    bestT = distance;
    bestTri = t;
    bestU = u / det;
    bestV = v / det;
  }

  if (bestTri < 0) return null;

  const a = tri[bestTri * 3];
  const b = tri[bestTri * 3 + 1];
  const c = tri[bestTri * 3 + 2];
  const w0 = 1 - bestU - bestV;

  result.u = w0 * uv.getX(a) + bestU * uv.getX(b) + bestV * uv.getX(c);
  result.v = w0 * uv.getY(a) + bestU * uv.getY(b) + bestV * uv.getY(c);
  result.distance = bestT;
  result.point.copy(ray.direction).multiplyScalar(bestT).add(ray.origin);

  // The face's own normal, in world space already: the positions it is built
  // from are posed, so nothing has to be transformed afterwards.
  edge1.set(positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]);
  edge2.set(positions[c * 3] - positions[a * 3], positions[c * 3 + 1] - positions[a * 3 + 1], positions[c * 3 + 2] - positions[a * 3 + 2]);
  result.normal.crossVectors(edge1, edge2).normalize();

  return result;
}

/**
 * The poses, in the order of the number keys that select them. Index 0 (key
 * `1`) is the normal upright stance and is what everyone spawns in.
 *
 * A pose is a set of joint angles, not a different model. Angles are radians on
 * a rig whose limbs hang straight down at rest:
 *   - `x` swings the limb forward (the figure faces -Z)
 *   - `spread` swings it out to the figure's side; it is mirrored per side, so
 *     one number moves both arms or both legs symmetrically
 *
 * `roll` lays the whole figure on its side and `rootX` tips it forward onto its
 * face; `offsetY` drops the root so a low pose rests on the floor rather than
 * floating. `shape` picks the collider the pose needs — see `poseExtents`.
 */

import { POSE_COUNT } from "@/shared/protocol.mjs";

export type Joint = { x?: number; spread?: number };

export type Pose = {
  key: string;
  label: string;
  /** stand = full height · prone = rolled on its side · low = a crouch-sized cube */
  shape?: "stand" | "prone" | "low";
  roll?: boolean;
  rootX?: number;
  offsetY?: number;
  torso?: Joint;
  head?: Joint;
  shoulder?: Joint;
  elbow?: Joint;
  hip?: Joint;
  knee?: Joint;
};

export const POSES: Pose[] = [
  {
    key: "stand",
    label: "Stand",
    shoulder: { spread: 0.09 },
  },
  {
    key: "crumple",
    label: "Crumple",
    shape: "low",
    // Kneeling and folded right down: shins flat on the floor, thighs upright,
    // the torso doubled over past horizontal so the head reaches the ground and
    // the arms tuck underneath. The root is NOT tipped — tipping it takes the
    // legs with it and throws them out behind instead of folding them under.
    offsetY: -0.02,
    torso: { x: 1.62 },
    head: { x: 0.3 },
    shoulder: { x: -0.9, spread: 0.28 },
    elbow: { x: -1.1 },
    // Thighs swing forward and the knees fold right up, so the shins end up
    // flat on the floor with the seat resting back on the heels.
    hip: { x: 1.2, spread: 0.26 },
    knee: { x: -2.75 },
  },
  {
    key: "lie",
    label: "Lie on your side",
    shape: "prone",
    roll: true,
    head: { x: 0.2 },
    shoulder: { x: 1.45, spread: 0.15 },
    elbow: { x: 0.12 },
    hip: { x: 0.3 },
    knee: { x: -0.45 },
  },
  {
    key: "armsUp",
    label: "Arms up",
    shoulder: { x: 0.06, spread: 2.72 },
    elbow: { spread: -0.18 },
  },
  {
    key: "sit",
    label: "Sit",
    shape: "low",
    offsetY: -0.12,
    torso: { x: -0.08 },
    hip: { x: 1.5, spread: 0.25 },
    knee: { x: -1.25 },
    shoulder: { x: 0.3, spread: 0.28 },
    elbow: { x: 0.55 },
  },
];

/**
 * The pose count is part of the protocol — the server clamps an incoming pose
 * index against it — so it is defined once in `shared/protocol.mjs` and this
 * table is checked against it at import time. A mismatch is a loud crash on the
 * first page load and a failed `next build`, rather than a pose that silently
 * never arrives on anyone else's screen.
 */
if (POSES.length !== POSE_COUNT) {
  throw new Error(
    `poses.ts defines ${POSES.length} poses but shared/protocol.mjs says POSE_COUNT is ` +
      `${POSE_COUNT}. Update protocol.mjs — the server clamps against it.`,
  );
}

export { POSE_COUNT };

/** Clamps anything arriving off the network to a real pose index. */
export const safePose = (n: unknown) =>
  Number.isFinite(n) ? Math.min(POSE_COUNT - 1, Math.max(0, Math.trunc(n as number))) : 0;

/**
 * Half-height of a folded pose's collider — a crouch, so it can tuck under
 * things. It is a constant, *not* `hx`: tying a pose's height to how wide the
 * body is meant that narrowing the hider (so they can sink into walls) also
 * squashed their crouch down to nothing.
 */
const LOW_HALF = 0.4;

/**
 * Collider half-extents for a pose. A curled or seated figure keeps a low box;
 * lying down keeps the standing box but rolled, which is handled by the
 * caller's rotation.
 */
export function poseExtents(
  pose: number,
  [hx, hy, hz]: [number, number, number],
): [number, number, number] {
  return (POSES[safePose(pose)].shape ?? "stand") === "low"
    ? [hx, LOW_HALF, hz]
    : [hx, hy, hz];
}

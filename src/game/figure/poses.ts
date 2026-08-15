// The poses, in the order of the number keys that select them.

import { POSE_COUNT } from "@/game/shared/protocol";

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
    // The rig's two hip bones share one origin, so a leg with no spread lands
    // exactly on top of its twin. Every upright pose has to part them itself.
    shoulder: { spread: 0.09 },
    hip: { spread: 0.38 },
    knee: { spread: -0.38 },
  },
  {
    key: "reach",
    label: "Reach up",
    // Fitted to `pose_7_arms_overhead`: straight up, forearms angled in so the
    // hands meet. The fit put the legs together, which on this rig means one
    // leg exactly inside the other, so they keep the standing stance instead.
    head: { x: 0.02 },
    shoulder: { x: 0.05, spread: 2.98 },
    elbow: { x: 0.06, spread: 0.53 },
    hip: { spread: 0.38 },
    knee: { spread: -0.38 },
  },
  {
    key: "star",
    label: "Star jump",
    // Arms and legs thrown wide — near the rig's own bind pose, which is why
    // this one needed no fitting.
    offsetY: -0.07,
    shoulder: { spread: 2.36 },
    hip: { spread: 0.44 },
  },
  {
    key: "lie",
    label: "Lie flat",
    // Fitted to `pose_0_lie_flat`: straight out, arms reaching past the head.
    // The body is upright here and *rolled* onto its side by `roll`, which is
    // why the arms read as overhead rather than as lying beside the body.
    shape: "prone",
    roll: true,
    head: { x: 0.1 },
    shoulder: { x: 0.05, spread: 3.15 },
    elbow: { x: 0.13, spread: 0.56 },
    hip: { spread: 0.5 },
    knee: { spread: -0.61 },
  },
  {
    key: "curl",
    label: "Curl up",
    // Fitted to `pose_6_curl_ball` in characters/figure-poses.blend — the torso
    // doubled right over, arms tucked under, knees folded in. See invariant 16.
    shape: "low",
    torso: { x: 2.0 },
    head: { x: 0.78 },
    shoulder: { x: -1.26, spread: -0.12 },
    elbow: { x: -1.58, spread: -0.12 },
    hip: { spread: 0.28 },
    knee: { x: -1.49, spread: 0.19 },
  },
];

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

/** Half-height of a folded pose's collider — a crouch, so it can tuck under things. */
const LOW_HALF = 0.4;

/** Collider half-extents for a pose. */
export function poseExtents(
  pose: number,
  [hx, hy, hz]: [number, number, number],
): [number, number, number] {
  return (POSES[safePose(pose)].shape ?? "stand") === "low"
    ? [hx, LOW_HALF, hz]
    : [hx, hy, hz];
}

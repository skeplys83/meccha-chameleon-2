// The poses, in the order of the number keys that select them.

import { POSE_COUNT } from "@/game/shared/protocol";

/**
 * One joint's three angles, in radians. **All three are required**, so every
 * pose states every knob it has, zeros included — the table is a dial board
 * rather than a diff against a default, and a joint nobody has thought about is
 * indistinguishable from one deliberately left at rest. Zero is the rig's bind
 * rotation either way.
 *
 * They mean slightly different things on the two kinds of joint, because the
 * two kinds of bone do (see `rig.ts`):
 *
 * - **A limb** (`shoulder`, `elbow`, `hip`, `knee`) is *aimed*: `x` swings it
 *   forward, `spread` swings it out, and `twist` rolls it about its own length
 *   without moving where it points.
 * - **A lean** (`torso`, `chest`, `neck`, `head`, `clavicle`) is *turned* about
 *   the figure's own axes: `x` pitches, `twist` yaws, `spread` tilts sideways.
 *   Mind the sign — a positive `x` swings a limb forward and leans the spine
 *   *backward*; see invariant 10.
 *
 * **`spread` and `twist` are outward, per side**, so the same number means the
 * same thing on the left and on the right and a mirrored pair is two identical
 * `Joint`s. It is `x` that is not mirrored: forward is forward for both.
 * Crossing a limb over the body is therefore a *negative* spread on that side.
 */
export type Joint = { x: number; spread: number; twist: number };

/** Two sides of one joint, stated separately. */
export type Sides = { left: Joint; right: Joint };

/**
 * Every bone in the 14-bone rig is dialable from here, and every pose fills in
 * all of it.
 *
 * **The three arm joints are per side and the two leg joints are not.** A
 * `clavicle`, `shoulder` or `elbow` carries a `left` and a `right`, so one arm
 * can reach while the other hangs; `hip` and `knee` are still one `Joint`
 * applied to both legs, mirrored. That is not a claim that legs cannot be
 * asymmetric — `rig.ts` has held every joint as `[left, right]` since the
 * skeleton arrived, and the aiming arm already uses it — it is just that
 * nothing has needed it yet. Splitting them is the same change made twice more.
 *
 * The four singles are `torso` (`Spine1`), `chest` (`Spine1.001`), `neck` and
 * `head`; the bones behind the pairs are `Shoulder.L/R`, `UpperArm.L/R`,
 * `LowerArm.L/R`, `UpperLeg.L/R` and `LowerLeg.L/R`.
 *
 * Nothing here is optional. The compiler is what keeps a new pose complete, and
 * what is lost — being able to see at a glance which joints a pose *moves* —
 * comes back in the developer readout, which dims every angle sitting at zero.
 */
export type Pose = {
  key: string;
  label: string;
  /** stand = full height · prone = rolled on its side · low = a crouch-sized cube */
  shape: "stand" | "prone" | "low";
  roll: boolean;
  rootX: number;
  /** Shift the whole figure inside its collider — the body's own middle is not
   *  its origin once a pose reaches out. `z` is forward-negative, as ever. */
  offsetY: number;
  offsetZ: number;
  torso: Joint;
  /** `Spine1.001`. It shares `Spine1`'s origin, so it composes with the torso
   *  lean rather than curving the back — see invariant 17. */
  chest: Joint;
  neck: Joint;
  head: Joint;
  /** The collar bones. They move where the arms *start*, not where they point. */
  clavicle: Sides;
  shoulder: Sides;
  elbow: Sides;
  hip: Joint;
  knee: Joint;
};

export const POSES: Pose[] = [
  {
    key: "stand",
    label: "Stand",
    shape: "stand",
    roll: false,
    rootX: 0,
    offsetY: 0,
    offsetZ: 0,
    torso: { x: 0, spread: 0, twist: 0 },
    chest: { x: 0, spread: 0, twist: 0 },
    neck: { x: 0, spread: 0, twist: 0 },
    head: { x: 0, spread: 0, twist: 0 },
    clavicle: {
      left: { x: 0, spread: 0, twist: 0 },
      right: { x: 0, spread: 0, twist: 0 },
    },
    shoulder: {
      left: { x: 0, spread: 0.09, twist: 0 },
      right: { x: 0, spread: 0.09, twist: 0 },
    },
    elbow: {
      left: { x: 0, spread: 0, twist: 0 },
      right: { x: 0, spread: 0, twist: 0 },
    },
    // The rig's two hip bones share one origin, so a leg with no spread lands
    // exactly on top of its twin. Every upright pose has to part them itself.
    hip: { x: 0, spread: 0.38, twist: 0 },
    knee: { x: 0, spread: -0.38, twist: 0 },
  },
  {
    key: "reach",
    label: "Reach up",
    // Fitted to `pose_7_arms_overhead`: straight up, forearms angled in so the
    // hands meet. The fit put the legs together, which on this rig means one
    // leg exactly inside the other, so they keep the standing stance instead.
    shape: "stand",
    roll: false,
    rootX: 0,
    offsetY: 0,
    offsetZ: 0,
    torso: { x: 0, spread: 0, twist: 0 },
    chest: { x: 0, spread: 0, twist: 0 },
    neck: { x: 0, spread: 0, twist: 0 },
    head: { x: 0.02, spread: 0, twist: 0 },
    clavicle: {
      left: { x: 0, spread: 0, twist: 0 },
      right: { x: 0, spread: 0, twist: 0 },
    },
    shoulder: {
      left: { x: 0.05, spread: 2.98, twist: 0 },
      right: { x: 0.05, spread: 2.98, twist: 0 },
    },
    elbow: {
      left: { x: 0.06, spread: 0.53, twist: 0 },
      right: { x: 0.06, spread: 0.53, twist: 0 },
    },
    hip: { x: 0, spread: 0.38, twist: 0 },
    knee: { x: 0, spread: -0.38, twist: 0 },
  },
  {
    key: "star",
    label: "Star jump",
    // Arms and legs thrown wide — near the rig's own bind pose, which is why
    // this one needed no fitting.
    shape: "stand",
    roll: false,
    rootX: 0,
    offsetY: -0.07,
    offsetZ: 0,
    torso: { x: 0, spread: 0, twist: 0 },
    chest: { x: 0, spread: 0, twist: 0 },
    neck: { x: 0, spread: 0, twist: 0 },
    head: { x: 0, spread: 0, twist: 0 },
    clavicle: {
      left: { x: 0, spread: 0, twist: 0 },
      right: { x: 0, spread: 0, twist: 0 },
    },
    shoulder: {
      left: { x: 0, spread: 2.36, twist: 0 },
      right: { x: 0, spread: 2.36, twist: 0 },
    },
    elbow: {
      left: { x: 0, spread: 0, twist: 0 },
      right: { x: 0, spread: 0, twist: 0 },
    },
    hip: { x: 0, spread: 0.8, twist: 0 },
    knee: { x: 0, spread: -0.2, twist: 0 },
  },
  {
    key: "lie",
    label: "Lie flat",
    // Fitted to `pose_0_lie_flat`: straight out, arms reaching past the head.
    // The body is upright here and *rolled* onto its side by `roll`, which is
    // why the arms read as overhead rather than as lying beside the body.
    shape: "prone",
    roll: true,
    rootX: 0,
    offsetY: 0,
    offsetZ: 0,
    torso: { x: 0, spread: 0, twist: 0 },
    chest: { x: 0, spread: 0, twist: 0 },
    neck: { x: 0, spread: -0.6, twist: 0 },
    head: { x: 0.1, spread: 0, twist: 0 },
    clavicle: {
      left: { x: 0.0, spread: 1.0, twist: 0 },
      right: { x: 0.0, spread: 0.0, twist: 0.0 },
    },
    shoulder: {
      left: { x: 0.05, spread: 3.4, twist: 0 },
      right: { x: -0.05, spread: 0.0, twist: 0 },
    },
    elbow: {
      left: { x: 0.13, spread: 1.0, twist: 0 },
      right: { x: 0.13, spread: 0.0, twist: 0 },
    },
    hip: { x: 0, spread: 0.4, twist: 0 },
    knee: { x: 0, spread: -0.4, twist: 0 },
  },
  {
    key: "curl",
    label: "Curl up",
    shape: "low",
    roll: false,
    rootX: 0,
    offsetY: 0.15,
    offsetZ: 0.3,
    torso: { x: 5.8, spread: 0, twist: 0 },
    chest: { x: -1, spread: 0, twist: 0 },
    neck: { x: -0.3, spread: 0.0, twist: 0 },
    head: { x: -1.57, spread: 0, twist: 0 },
    clavicle: {
      left: { x: 0, spread: 0, twist: 0 },
      right: { x: 0, spread: 0, twist: 0 },
    },
    shoulder: {
      left: { x: 1.0, spread: 0.05, twist: 0 },
      right: { x: 1.0, spread: 0.05, twist: 0 },
    },
    elbow: {
      right: { x: 1.8, spread: -1.05, twist: 0 },
      left: { x: 1.8, spread: -1.6, twist: 0 },
    },
    hip: { x: 1.8, spread: 0.5, twist: 0 },
    knee: { x: -2.8, spread: 0.5, twist: 0 },
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

/**
 * A folded pose's collider. It is a *lying* box rather than a short upright one:
 * the curl measures 0.76 × 0.76 × 1.10 and a 0.24-wide post inside that is a
 * body with no collision at all, which is what it was. Still deliberately
 * smaller than the body it carries — that gap is the hiding mechanic, see
 * `players/CLAUDE.md`.
 */
const LOW_HALF: [number, number, number] = [0.28, 0.38, 0.42];

/** Collider half-extents for a pose. */
export function poseExtents(
  pose: number,
  [hx, hy, hz]: [number, number, number],
): [number, number, number] {
  return POSES[safePose(pose)].shape === "low" ? LOW_HALF : [hx, hy, hz];
}

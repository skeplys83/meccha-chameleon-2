import * as THREE from "three";
import type { Character } from "./model";

/** Writing a pose onto the skeleton. Kept apart from `StickFigure` because it
 *  is the one piece of this folder with no React in it, which is what lets it
 *  be run against the real `.glb` outside a browser — see `docs/VERIFYING.md`. */

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Which bones a pose drives. Everything else — the shoulders, the second spine
 *  bone, the neck, the hands — stays at its bind rotation and simply carries
 *  what hangs off it. */
export type Driven =
  | "Spine1"
  | "Head"
  | "UpperArmL"
  | "LowerArmL"
  | "UpperArmR"
  | "LowerArmR"
  | "UpperLegL"
  | "LowerLegL"
  | "UpperLegR"
  | "LowerLegR";

const DRIVEN: ReadonlySet<string> = new Set<Driven>([
  "Spine1",
  "Head",
  "UpperArmL",
  "LowerArmL",
  "UpperArmR",
  "LowerArmR",
  "UpperLegL",
  "LowerLegL",
  "UpperLegR",
  "LowerLegR",
]);

/** The damped angles a figure is currently holding. Kept per figure and eased
 *  toward the pose every frame, so the table stays a table of angles and the
 *  easing stays where it always was. Every pair is `[left, right]`: the gun arm
 *  leaves the pose entirely while aiming, so the two sides cannot share one
 *  number — and a walk cycle will want the same freedom in the legs. */
export type Angles = ReturnType<typeof makeAngles>;

export function makeAngles() {
  return {
    torsoX: 0,
    headX: 0,
    rootX: 0,
    roll: 0,
    offsetY: 0,
    shoulderX: [0, 0],
    shoulderZ: [0, 0],
    elbowX: [0, 0],
    elbowZ: [0, 0],
    hipX: [0, 0],
    hipZ: [0, 0],
    kneeX: [0, 0],
    kneeZ: [0, 0],
  };
}

export type Chain = ReturnType<typeof buildChain>;

/** The bone chain in hierarchy order, so a parent's rotation is always known
 *  before its children are placed. */
export function buildChain(character: Character) {
  const order: {
    bone: THREE.Bone;
    rest: THREE.Quaternion;
    parent: number;
    role: Driven | null;
  }[] = [];
  const visit = (bone: THREE.Bone, parent: number) => {
    const i = order.length;
    order.push({
      bone,
      rest: character.rest.get(bone) ?? bone.quaternion.clone(),
      parent,
      role: DRIVEN.has(bone.name) ? (bone.name as Driven) : null,
    });
    for (const child of bone.children) {
      if ((child as THREE.Bone).isBone) visit(child as THREE.Bone, i);
    }
  };
  const root = character.bones.Spine1;
  if (root) visit(root, -1);

  // Everything between the figure's own group and the first bone: the exporter
  // leaves a node there carrying the rotation that stands the model upright.
  const base = new THREE.Quaternion();
  const above: THREE.Object3D[] = [];
  for (let o = root?.parent; o && o !== character.root; o = o.parent) above.push(o);
  for (let i = above.length - 1; i >= 0; i--) base.multiply(above[i].quaternion);

  return { order, accumulated: order.map(() => new THREE.Quaternion()), base };
}

/** Scratch, reused every frame — a figure poses ten bones per frame and every
 *  one of these would otherwise be an allocation. */
const scratch = {
  euler: new THREE.Euler(),
  torso: new THREE.Quaternion(),
  limb: new THREE.Quaternion(),
  joint: new THREE.Quaternion(),
  invParent: new THREE.Quaternion(),
  swing: new THREE.Quaternion(),
  dir: new THREE.Vector3(),
  restDir: new THREE.Vector3(),
  axis: new THREE.Vector3(),
};

/** The figure's own left-right axis, which a lean turns about. */
const PITCH = new THREE.Vector3(1, 0, 0);

/**
 * Where a limb bone's own axis should point, in the figure's own frame.
 *
 * Arms ride the torso's lean and the legs deliberately do not, which is the one
 * thing the old jointed rig said out loud. It survives the move to a skeleton
 * where the legs hang off the same spine bone the lean is written onto, because
 * a target is stated in the figure's frame and then divided back through the
 * parent's rotation — so whatever the spine did is cancelled unless it is asked
 * for here.
 */
function target(role: Driven, a: Angles, out: THREE.Vector3): THREE.Vector3 {
  const { euler, torso, limb, joint } = scratch;
  const i = role.endsWith("R") ? 1 : 0;
  if (role.startsWith("UpperLeg") || role.startsWith("LowerLeg")) {
    limb.setFromEuler(euler.set(a.hipX[i], 0, a.hipZ[i]));
    if (role.startsWith("LowerLeg")) {
      limb.multiply(joint.setFromEuler(euler.set(a.kneeX[i], 0, a.kneeZ[i])));
    }
    return out.copy(DOWN).applyQuaternion(limb);
  }
  limb.setFromEuler(euler.set(a.shoulderX[i], 0, a.shoulderZ[i]));
  if (role.startsWith("LowerArm")) {
    limb.multiply(joint.setFromEuler(euler.set(a.elbowX[i], 0, a.elbowZ[i])));
  }
  out.copy(DOWN).applyQuaternion(limb);
  return out.applyQuaternion(torso.setFromEuler(euler.set(a.torsoX, 0, 0)));
}

/**
 * Write the angles onto the bones.
 *
 * The rig is bound in the star pose, so a bone's rest rotation is most of where
 * its limb already points. Each driven bone is solved for the *swing* that
 * takes its rest direction to the target and that swing is composed onto the
 * rest — never written over it, which is the mistake that folds the body
 * inside out.
 */
export function applyPose(chain: Chain, a: Angles) {
  const { invParent, swing, dir, restDir, axis } = scratch;
  for (let i = 0; i < chain.order.length; i++) {
    const link = chain.order[i];
    // The skeleton sits inside a node the exporter rotated to stand the model
    // up, so the chain starts from that rather than from nothing — miss it and
    // every target is solved in a frame tipped on its side.
    const parentQ = link.parent >= 0 ? chain.accumulated[link.parent] : chain.base;

    if (link.role === "Spine1" || link.role === "Head") {
      // A lean, not an aim. `Spine1` runs *downward* from the waist, so asking
      // it to point at the sky folds the body in half; the head already points
      // where it should. Both simply turn about the figure's own left-right
      // axis, the head on top of whatever the torso did.
      axis.copy(PITCH).applyQuaternion(invParent.copy(parentQ).invert()).normalize();
      swing.setFromAxisAngle(axis, link.role === "Spine1" ? a.torsoX : a.headX);
      link.bone.quaternion.copy(swing).multiply(link.rest);
    } else if (link.role) {
      target(link.role, a, dir).normalize();
      dir.applyQuaternion(invParent.copy(parentQ).invert());
      restDir.copy(UP).applyQuaternion(link.rest).normalize();
      swing.setFromUnitVectors(restDir, dir);
      link.bone.quaternion.copy(swing).multiply(link.rest);
    }
    chain.accumulated[i].copy(parentQ).multiply(link.bone.quaternion);
  }
}

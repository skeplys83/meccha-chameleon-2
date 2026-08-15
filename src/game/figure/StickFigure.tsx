import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { POSES, safePose, type Joint } from "./poses";
import { getSkin } from "@/game/paint/skin";
import { makeCharacter, preloadCharacter, type Character } from "./model";
import { applyPose, buildChain, makeAngles } from "./rig";

/** How fast a limb settles into a new pose. Higher is snappier. */
const POSE_DAMP = 14;

/** Elbow to wrist, in the bone's own units — where the shotgun sits, since the
 *  rig ends at the forearm. Measured off the model: the vertices weighted to
 *  `LowerArmR` run 0 to 0.578 along that bone's own axis. */
const FOREARM_LENGTH = 0.58;

const REVEAL_ORDER = 20;
const REVEAL_COLOR = new THREE.Color("#ff2a36");
/** Beats per second. Slow enough to read as breathing rather than an alarm. */
const REVEAL_HZ = 1.15;

/** One red material for every highlighted body in the scene, shared on purpose. */
const revealMaterial = new THREE.MeshBasicMaterial({
  color: REVEAL_COLOR,
  toneMapped: false,
  depthTest: false,
  transparent: true,
  // Transparent *and* depth-ignoring: without this the parts of one body would
  // punch holes in each other through a depth buffer they are not consulting.
  depthWrite: false,
});

/** Drive the shared pulse. Idempotent, so every highlighted figure may call it. */
function pulseReveal(elapsed: number) {
  revealMaterial.opacity = (Math.sin(elapsed * Math.PI * 2 * REVEAL_HZ) + 1) / 2;
}

/** Everything one figure owns: its own skeleton, its own material, and the
 *  chain the pose is written onto. */
type Rig = {
  character: Character;
  material: THREE.Material;
  overlay: THREE.SkinnedMesh | null;
  chain: ReturnType<typeof buildChain>;
};

export function StickFigure({
  scale = 1,
  pose = 0,
  skinId,
  aim = null,
  holding,
  highlight = false,
}: {
  scale?: number;
  /** A getter for remote figures: their pose changes on network patches, which
   *  deliberately do not re-render the tree. */
  pose?: number | (() => number);
  /** Which body's paint to wear — SELF for the local player, session id otherwise. */
  skinId: string;
  /** Aim pitch in radians. */
  aim?: (() => number) | null;
  /** Rendered in the right hand, barrel already aligned down the arm. */
  holding?: ReactNode;
  /** Paint this body one flat colour and draw it through walls. */
  highlight?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const angles = useRef(makeAngles());
  const skin = getSkin(skinId);

  /** Where the shotgun hangs. A child of the forearm bone, so it needs no frame
   *  callback of its own. The rig has no hand bone, so the grip is pushed down
   *  the forearm's own axis (+Y runs from elbow to wrist) by its length. */
  const grip = useMemo(() => {
    const g = new THREE.Group();
    g.position.y = FOREARM_LENGTH;
    return g;
  }, []);
  const [rig, setRig] = useState<Rig | null>(null);

  // The body is built once the model has landed, and this component renders
  // nothing until then — deliberately, because suspending here would tear down
  // the collider the figure is mounted inside. `Game.tsx` starts the fetch on
  // the join click; awaiting the same idempotent promise is what makes a figure
  // that mounts first still get a body.
  useEffect(() => {
    let live = true;
    let built: Rig | null = null;
    void preloadCharacter().then(() => {
      if (!live) return;
      const character = makeCharacter();
      if (!character) return;

      const material = highlight
        ? new THREE.MeshBasicMaterial({
            map: skin,
            toneMapped: false,
            depthTest: false,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({ map: skin, roughness: 0.55 });
      character.mesh.material = material;
      character.mesh.renderOrder = highlight ? REVEAL_ORDER : 0;
      character.mesh.castShadow = !highlight;
      // What the paint raycast looks for. There are no per-part meshes any
      // more: the hit's UV says which part it landed on — see `parts.ts`.
      character.mesh.userData.body = true;

      // The reveal marker: a second skinned mesh on the *same* skeleton, so it
      // follows the body for free rather than being posed twice.
      let overlay: THREE.SkinnedMesh | null = null;
      if (highlight) {
        overlay = new THREE.SkinnedMesh(character.mesh.geometry, revealMaterial);
        overlay.bind(character.mesh.skeleton, character.mesh.bindMatrix);
        overlay.renderOrder = REVEAL_ORDER + 1;
        overlay.frustumCulled = false;
        // A shot must find the body, never its marker.
        overlay.raycast = () => null;
        character.mesh.parent?.add(overlay);
      }

      character.bones.LowerArmR?.add(grip);
      built = { character, material, overlay, chain: buildChain(character) };
      setRig(built);
    });
    return () => {
      live = false;
      setRig(null);
      if (!built) return;
      built.overlay?.parent?.remove(built.overlay);
      built.character.bones.LowerArmR?.remove(grip);
      built.material.dispose();
    };
  }, [skin, highlight, grip]);

  useFrame((state, delta) => {
    if (highlight) pulseReveal(state.clock.elapsedTime);
    if (!rig) return;
    const { chain } = rig;

    const p = POSES[safePose(typeof pose === "function" ? pose() : pose)];
    const a = angles.current;
    const to = (from: number, target: number) =>
      THREE.MathUtils.damp(from, target, POSE_DAMP, delta);
    /** One leaning bone: pitch, yaw, tilt. Every joint carries all three — see
     *  `Joint`, where none of them is optional. */
    const lean = (j: Joint, of: "torso" | "chest" | "neck" | "head") => {
      a[`${of}X`] = to(a[`${of}X`], j.x);
      a[`${of}Y`] = to(a[`${of}Y`], j.twist);
      a[`${of}Z`] = to(a[`${of}Z`], j.spread);
    };

    lean(p.torso, "torso");
    lean(p.chest, "chest");
    lean(p.neck, "neck");
    lean(p.head, "head");
    a.rootX = to(a.rootX, p.rootX);
    a.roll = to(a.roll, p.roll ? Math.PI / 2 : 0);
    a.offsetY = to(a.offsetY, p.offsetY);
    a.offsetZ = to(a.offsetZ, p.offsetZ);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // `Angles` is indexed [left, right]; the table names its two sides.
      const of = i === 0 ? "left" : "right";
      const clavicle = p.clavicle[of];
      const shoulder = p.shoulder[of];
      const elbow = p.elbow[of];
      // The gun arm is driven by the aim instead of the pose.
      const aiming = aim !== null && i === 1;
      // Straight out in front at rest (x = π/2), rising and falling with pitch.
      const shoulderX = aiming ? Math.PI / 2 + aim() : shoulder.x;
      const shoulderZ = aiming ? 0.12 : shoulder.spread * side;
      a.clavicleX[i] = to(a.clavicleX[i], clavicle.x);
      a.clavicleY[i] = to(a.clavicleY[i], clavicle.twist * side);
      a.clavicleZ[i] = to(a.clavicleZ[i], clavicle.spread * side);
      a.shoulderX[i] = to(a.shoulderX[i], shoulderX);
      a.shoulderY[i] = to(a.shoulderY[i], aiming ? 0 : shoulder.twist * side);
      a.shoulderZ[i] = to(a.shoulderZ[i], shoulderZ);
      a.elbowX[i] = to(a.elbowX[i], aiming ? 0 : elbow.x);
      a.elbowY[i] = to(a.elbowY[i], aiming ? 0 : elbow.twist * side);
      a.elbowZ[i] = to(a.elbowZ[i], aiming ? 0 : elbow.spread * side);
      a.hipX[i] = to(a.hipX[i], p.hip.x);
      a.hipY[i] = to(a.hipY[i], p.hip.twist * side);
      a.hipZ[i] = to(a.hipZ[i], p.hip.spread * side);
      a.kneeX[i] = to(a.kneeX[i], p.knee.x);
      a.kneeY[i] = to(a.kneeY[i], p.knee.twist * side);
      a.kneeZ[i] = to(a.kneeZ[i], p.knee.spread * side);
    }

    const g = root.current;
    if (g) {
      g.position.y = a.offsetY;
      g.position.z = a.offsetZ;
      // Lying down is a roll of the whole body and crumpling is a tip forward,
      // both damped like every other joint so the figure keels over instead of
      // snapping into place.
      g.rotation.z = a.roll;
      g.rotation.x = a.rootX;
    }

    applyPose(chain, a);
  });

  if (!rig) return null;

  return (
    <group ref={root} scale={scale}>
      <primitive object={rig.character.root} />
      {holding && createPortal(<group rotation={[Math.PI / 2, 0, 0]}>{holding}</group>, grip)}
    </group>
  );
}

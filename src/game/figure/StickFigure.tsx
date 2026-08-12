import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { POSES, safePose, type Joint } from "./poses";
import { getSkin } from "@/game/paint/skin";
import { PART_SHAPE, type Part } from "./parts";

/**
 * Thick-limbed stick figure on a small joint rig, built to a half-height of 1
 * so callers can scale it to a role's body size. Origin sits at the middle of
 * the body.
 *
 * Limbs are groups pivoted at the joint with the capsule hanging below, so a
 * pose is just a set of rotations (see poses.ts). Each part carries its own
 * canvas texture and is named, which is what lets the paint mode raycast a
 * limb and know which canvas to draw into.
 */

// Proportions are chosen so the figure fills its collider: the soles land at
// -1 and the crown at +1, matching the half-height of 1 it is built to.
const HEAD_Y = 0.74;
const HEAD_R = PART_SHAPE.head.radius;
const TORSO_Y = 0.22;
const SHOULDER = new THREE.Vector3(0.28, 0.44, 0);
const HIP = new THREE.Vector3(0.15, -0.1, 0);
// Limb sizes come from PART_SHAPE so the geometry and the brush maths in
// skin.ts can never drift apart.
const UPPER_ARM = PART_SHAPE.armUpperL.length;
const FORE_ARM = PART_SHAPE.armForeL.length;
const UPPER_LEG = PART_SHAPE.legUpperL.length;

/** How fast a limb settles into a new pose. Higher is snappier. */
const POSE_DAMP = 14;

/**
 * A revealed body is **two stacked meshes**, and the pulse crossfades between
 * them: solid red at the top of the beat, the player's own paint at the bottom.
 *
 * That is the whole point of the reveal, and it needs two layers because no
 * single material can do it. Tinting a textured material toward red *multiplies*
 * — red times a green patch is black — so a painted body would go dark rather
 * than red. Fading to transparent instead was the first attempt and threw away
 * the more interesting half: what you actually want to see at the end of a round
 * is the camouflage that worked.
 *
 * Both layers ignore depth, so a survivor is visible through the wall they hid
 * behind, and both are unlit — the paint is a *colour match* against a surface,
 * so showing it shaded would misrepresent the thing being judged.
 */
const REVEAL_ORDER = 20;
const REVEAL_COLOR = new THREE.Color("#ff2a36");
/** Beats per second. Slow enough to read as breathing rather than an alarm. */
const REVEAL_HZ = 1.15;

/**
 * **One red material for every highlighted body in the scene, shared on purpose.**
 *
 * It is animated, and a material per part per figure would mean twelve times as
 * many opacity writes a frame for an identical result — worse, they would drift
 * out of phase and the pulse would stop reading as one deliberate signal. One
 * instance means one write and every survivor beating together.
 */
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

/**
 * The paint layer of a revealed body: the real texture, unlit and through walls.
 *
 * Per part rather than shared, because the whole point is that each part wears
 * its own canvas.
 */
function RevealedPaint({ texture }: { texture: THREE.CanvasTexture }) {
  return (
    <meshBasicMaterial map={texture} toneMapped={false} depthTest={false} depthWrite={false} />
  );
}

/** The overlay never takes a raycast: a shot must find the body, not its marker. */
const noRaycast = () => null;

function Segment({
  part,
  skin,
  highlight,
}: {
  part: Part;
  skin: Record<Part, THREE.CanvasTexture>;
  highlight: boolean;
}) {
  const { radius, length } = PART_SHAPE[part];
  const geometry = <capsuleGeometry args={[radius, length, 8, 20]} />;
  return (
    <>
      <mesh
        position={[0, -length / 2, 0]}
        castShadow={!highlight}
        renderOrder={highlight ? REVEAL_ORDER : 0}
        name={`PART:${part}`}
        userData={{ part }}
      >
        {geometry}
        {highlight ? (
          <RevealedPaint texture={skin[part]} />
        ) : (
          <meshStandardMaterial map={skin[part]} roughness={0.55} />
        )}
      </mesh>
      {highlight && (
        <mesh
          position={[0, -length / 2, 0]}
          renderOrder={REVEAL_ORDER + 1}
          material={revealMaterial}
          raycast={noRaycast}
        >
          {geometry}
        </mesh>
      )}
    </>
  );
}

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
  /**
   * Aim pitch in radians. When given, the right arm leaves the pose and points
   * where the player is looking — the figure's yaw is already the aim yaw, so
   * the arm only needs the elevation.
   */
  aim?: (() => number) | null;
  /** Rendered in the right hand, barrel already aligned down the arm. */
  holding?: ReactNode;
  /**
   * Paint this body one flat colour and draw it through walls.
   *
   * Used for the surviving chameleons during the reveal, so a round ends by
   * showing everybody where the people who beat them were actually standing.
   * It replaces the paint deliberately: camouflage is the thing being revealed,
   * and leaving it on would hide the very figure this is meant to expose.
   */
  highlight?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shoulders = useRef<(THREE.Group | null)[]>([]);
  const elbows = useRef<(THREE.Group | null)[]>([]);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const skin = getSkin(skinId);

  useFrame((state, delta) => {
    if (highlight) pulseReveal(state.clock.elapsedTime);
    const p = POSES[safePose(typeof pose === "function" ? pose() : pose)];

    const settle = (g: THREE.Group | null | undefined, j: Joint | undefined, side: number) => {
      if (!g) return;
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, j?.x ?? 0, POSE_DAMP, delta);
      g.rotation.z = THREE.MathUtils.damp(
        g.rotation.z,
        (j?.spread ?? 0) * side,
        POSE_DAMP,
        delta,
      );
    };

    if (root.current) {
      root.current.position.y = THREE.MathUtils.damp(
        root.current.position.y,
        p.offsetY ?? 0,
        POSE_DAMP,
        delta,
      );
      // Lying down is a roll of the whole body and crumpling is a tip forward,
      // both damped like every other joint so the figure keels over instead of
      // snapping into place.
      root.current.rotation.z = THREE.MathUtils.damp(
        root.current.rotation.z,
        p.roll ? Math.PI / 2 : 0,
        POSE_DAMP,
        delta,
      );
      root.current.rotation.x = THREE.MathUtils.damp(
        root.current.rotation.x,
        p.rootX ?? 0,
        POSE_DAMP,
        delta,
      );
    }

    settle(torso.current, p.torso, 1);
    settle(head.current, p.head, 1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // The gun arm is driven by the aim instead of the pose.
      const aiming = aim !== null && i === 1;
      if (!aiming) {
        settle(shoulders.current[i], p.shoulder, side);
        settle(elbows.current[i], p.elbow, side);
      }
      settle(hips.current[i], p.hip, side);
      settle(knees.current[i], p.knee, side);
    }

    if (aim) {
      // Straight out in front at rest (x = π/2), rising and falling with pitch.
      settle(shoulders.current[1], { x: Math.PI / 2 + aim(), spread: 0.12 }, 1);
      settle(elbows.current[1], undefined, 1);
    }
  });

  const sides: [index: number, sign: number, tag: "L" | "R"][] = [
    [0, -1, "L"],
    [1, 1, "R"],
  ];

  return (
    <group ref={root} scale={scale}>
      <group ref={torso}>
        {/* torso */}
        <mesh
          position={[0, TORSO_Y, 0]}
          castShadow={!highlight}
          renderOrder={highlight ? REVEAL_ORDER : 0}
          name="PART:torso"
          userData={{ part: "torso" }}
        >
          <capsuleGeometry args={[PART_SHAPE.torso.radius, PART_SHAPE.torso.length, 8, 20]} />
          {highlight ? (
            <RevealedPaint texture={skin.torso} />
          ) : (
            <meshStandardMaterial map={skin.torso} roughness={0.55} />
          )}
        </mesh>
        {highlight && (
          <mesh
            position={[0, TORSO_Y, 0]}
            renderOrder={REVEAL_ORDER + 1}
            material={revealMaterial}
            raycast={noRaycast}
          >
            <capsuleGeometry args={[PART_SHAPE.torso.radius, PART_SHAPE.torso.length, 8, 20]} />
          </mesh>
        )}

        {/* head */}
        <group ref={head} position={[0, HEAD_Y - HEAD_R, 0]}>
          <mesh
            position={[0, HEAD_R, 0]}
            castShadow={!highlight}
            renderOrder={highlight ? REVEAL_ORDER : 0}
            name="PART:head"
            userData={{ part: "head" }}
          >
            <sphereGeometry args={[HEAD_R, 24, 24]} />
            {highlight ? (
              <RevealedPaint texture={skin.head} />
            ) : (
              <meshStandardMaterial map={skin.head} roughness={0.55} />
            )}
          </mesh>
          {highlight && (
            <mesh
              position={[0, HEAD_R, 0]}
              renderOrder={REVEAL_ORDER + 1}
              material={revealMaterial}
              raycast={noRaycast}
            >
              <sphereGeometry args={[HEAD_R, 24, 24]} />
            </mesh>
          )}
        </group>

        {/* arms */}
        {sides.map(([i, sign, tag]) => (
          <group
            key={`arm${tag}`}
            position={[sign * SHOULDER.x, SHOULDER.y, 0]}
            ref={(g) => {
              shoulders.current[i] = g;
            }}
          >
            <Segment part={`armUpper${tag}`} skin={skin} highlight={highlight} />
            <group
              position={[0, -UPPER_ARM, 0]}
              ref={(g) => {
                elbows.current[i] = g;
              }}
            >
              <Segment part={`armFore${tag}`} skin={skin} highlight={highlight} />
              {/* The hand. Rotating -90° about X turns the gun's -Z barrel to
                  run down the arm, so it points wherever the arm points. */}
              {tag === "R" && holding && (
                <group position={[0, -FORE_ARM, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  {holding}
                </group>
              )}
            </group>
          </group>
        ))}
      </group>

      {/* legs hang off the hips, which do not follow the torso lean */}
      {sides.map(([i, sign, tag]) => (
        <group
          key={`leg${tag}`}
          position={[sign * HIP.x, HIP.y, 0]}
          ref={(g) => {
            hips.current[i] = g;
          }}
        >
          <Segment part={`legUpper${tag}`} skin={skin} highlight={highlight} />
          <group
            position={[0, -UPPER_LEG, 0]}
            ref={(g) => {
              knees.current[i] = g;
            }}
          >
            <Segment part={`legLower${tag}`} skin={skin} highlight={highlight} />
          </group>
        </group>
      ))}
    </group>
  );
}

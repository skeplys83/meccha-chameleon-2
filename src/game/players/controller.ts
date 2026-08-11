import type { World } from "@dimforge/rapier3d-compat";

/**
 * Rapier's kinematic character controller, one per physics world.
 *
 * ## Why this file exists at all
 *
 * Creating the controller is a rapier call, and **rapier may only be called from
 * the frame loop** — trap 5 in the root doc. A handle touched after its world is
 * gone (an HMR remount is enough) panics inside wasm, and the module is poisoned
 * for the rest of the session. So it cannot be made in an effect, and it cannot
 * be disposed in one either.
 *
 * The answer is to key it off the world itself. `get()` is called from
 * `useFrame`, so the world is alive by construction; the `WeakMap` means a
 * `Player` that mounts, unmounts and remounts — respawning, changing role,
 * pausing — reuses the one controller instead of leaking a new one each time,
 * and a world that is discarded takes its entry with it without anybody calling
 * `removeCharacterController`.
 *
 * ## Why a character controller rather than a dynamic body
 *
 * The player used to be a dynamic `RigidBody` driven by `setLinvel`, with the
 * physics engine resolving penetration. That is what made a growing collider
 * able to bury itself in the floor and get *ejected out of the world*, and it is
 * why gravity had to be switched off per-body to climb. A kinematic controller
 * inverts it: this code decides where the body wants to go, rapier answers with
 * how far it may actually go, and nothing moves the player but us.
 */

/** Skin width. Rapier keeps the character this far off what it touches. */
const OFFSET = 0.01;

/**
 * The steepest slope that counts as ground rather than a wall.
 *
 * The arena's ramp is 0.32 rad ≈ 18°, comfortably inside this. The floor of the
 * value is what stops a chameleon "standing" on a wall they have run into.
 */
const MAX_CLIMB = (50 * Math.PI) / 180;
/** Below this, a slope does not slide you off. Keeps the ramp walkable. */
const MIN_SLIDE = (30 * Math.PI) / 180;

const byWorld = new WeakMap<World, ReturnType<World["createCharacterController"]>>();

/**
 * The controller for this world, made on first use.
 *
 * **Only ever call this from `useFrame`.** See the note above.
 *
 * Two settings are deliberately left *off*, and both are one line away if the
 * feel wants them:
 *
 * - **`enableAutostep`** would let a player walk up a step instead of jumping
 *   it. The arena is built on the opposite assumption — the stairs rise 0.9 a
 *   tread and the ziggurat is three 1-unit tiers, all sized to be *jumped* — so
 *   turning it on silently rewrites how the whole map is traversed.
 * - **`enableSnapToGround`** would keep the body glued to the floor over crests
 *   and down the ramp. It also eats jumps unless it is disabled on the way up,
 *   and the small hop coming down the ramp is what the map already plays like.
 */
export function characterController(world: World) {
  const existing = byWorld.get(world);
  /**
   * **The cached controller has to be checked against the world that owns it,
   * not just against the handle we looked it up by.**
   *
   * `useRapier().world` is a *singleton proxy* — a stable JS object that
   * @react-three/rapier can `reset()`, freeing the rapier world underneath while
   * the wrapper stays the same. A `WeakMap` keyed on the wrapper therefore
   * survives a reset and hands back a controller belonging to a world that no
   * longer exists. Calling `computeColliderMovement` on it panics wasm with
   * "attempted to take ownership of Rust value while it was borrowed", which
   * poisons the module: every later rapier call throws "recursive use of an
   * object", physics stops, the frame loop aborts and the canvas is lost. That
   * is trap 5 arriving through a cache rather than through an effect.
   *
   * The world keeps its own set of controllers, so it can be asked. After a
   * reset that set is empty and a fresh one is built.
   */
  if (existing && world.characterControllers?.has(existing)) return existing;

  const controller = world.createCharacterController(OFFSET);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.setMaxSlopeClimbAngle(MAX_CLIMB);
  controller.setMinSlopeSlideAngle(MIN_SLIDE);
  // Sliding along a wall you walk into at an angle, rather than stopping dead.
  // A dynamic body got this from the solver for free; a kinematic one asks.
  controller.setSlideEnabled(true);
  // The map is all fixed bodies and remote players have no colliders at all, so
  // there is nothing in the world to push. Off is both correct and cheaper.
  controller.setApplyImpulsesToDynamicBodies(false);
  byWorld.set(world, controller);
  return controller;
}

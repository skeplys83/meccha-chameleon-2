import type { World } from "@dimforge/rapier3d-compat";

/** Skin width. Rapier keeps the character this far off what it touches. */
const OFFSET = 0.01;

/** The steepest slope that counts as ground rather than a wall. */
const MAX_CLIMB = (50 * Math.PI) / 180;
/** Below this, a slope does not slide you off. Keeps the ramp walkable. */
const MIN_SLIDE = (30 * Math.PI) / 180;

const byWorld = new WeakMap<World, ReturnType<World["createCharacterController"]>>();

/** The controller for this world, made on first use. */
export function characterController(world: World) {
  const existing = byWorld.get(world);
  /** See trap 5. */
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

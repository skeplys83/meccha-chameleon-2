import type { World } from "@dimforge/rapier3d-compat";

/**
 * Skin width. Rapier keeps the character this far off what it touches, so it
 * adds to the collider when working out how close a body may get. Kept small
 * because a chameleon is meant to *meet* what it hides against — see
 * `body.ts` — but never zero, which rapier does not allow.
 */
const OFFSET = 0.005;

/** The steepest slope that counts as ground rather than a wall. */
const MAX_CLIMB = (50 * Math.PI) / 180;
/** Below this, a slope does not slide you off. Keeps the ramp walkable. */
const MIN_SLIDE = (30 * Math.PI) / 180;

/** Tallest step the character is lifted over. The dungeon's treads are 0.50. */
const STEP_HEIGHT = 0.6;
/** Landing the step needs this much clear floor beyond it, or it is refused. */
const STEP_WIDTH = 0.3;

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
  // The dungeon's staircases are eight 0.50 treads, and a ramp collider under
  // them would be 34 degrees — past MIN_SLIDE, so you would slide back down.
  // Stepping over the real treads is what makes them climbable, and it makes
  // every knee-high prop steppable rather than a wall. See levels/AUTHORING.md §5.
  controller.enableAutostep(STEP_HEIGHT, STEP_WIDTH, false);
  // Sliding along a wall you walk into at an angle, rather than stopping dead.
  // A dynamic body got this from the solver for free; a kinematic one asks.
  controller.setSlideEnabled(true);
  // The map is all fixed bodies and remote players have no colliders at all, so
  // there is nothing in the world to push. Off is both correct and cheaper.
  controller.setApplyImpulsesToDynamicBodies(false);
  byWorld.set(world, controller);
  return controller;
}

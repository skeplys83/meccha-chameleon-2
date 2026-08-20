/**
 * A one-frame pulse from the trigger to the viewmodel.
 *
 * `usePointerControls` knows a shot went off; `Viewmodel` draws the gun. They
 * are in different folders and different frame priorities, and the alternative
 * — threading a prop from `Game.tsx` down through `Scene` — would put a React
 * re-render on every trigger pull. A boolean read once and cleared costs
 * nothing and cannot fall behind.
 */
let pending = false;

/** Fired the shotgun. Safe to call more often than the viewmodel reads. */
export const kickViewmodel = () => {
  pending = true;
};

/** True at most once per shot. Read from the viewmodel's frame loop. */
export function takeKick() {
  if (!pending) return false;
  pending = false;
  return true;
}

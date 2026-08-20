/**
 * How far the local player has walked, on foot, in metres.
 *
 * It advances under exactly the condition that plays a footstep — grounded and
 * not clinging — and stands still otherwise. That is the whole point: anything
 * driven off it is in step with the sound by construction, and stops dead in
 * mid-air rather than being carried along by a fall or a jump's forward drift.
 *
 * Monotonic and never reset. Readers keep their own previous value and use the
 * difference, so a room change costs nothing and there is no ordering to get
 * wrong between the writer being rebuilt and the reader not being.
 */
let walked = 0;

/** Called once a frame by `Player.tsx`, with this frame's ground distance. */
export const addWalked = (metres: number) => {
  walked += metres;
};

export const walkedDistance = () => walked;

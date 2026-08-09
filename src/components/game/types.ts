export type Role = "hider" | "seeker";

/** Half-extents of the player's collider. Seekers are bigger. */
export const BODY: Record<Role, [hx: number, hy: number, hz: number]> = {
  hider: [0.4, 1, 0.4],
  seeker: [0.52, 1.3, 0.52],
};

export type Mark = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

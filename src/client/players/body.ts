import type { Role } from "@/shared/protocol";

/**
 * Half-extents of the player's collider.
 *
 * **A chameleon's collider is deliberately much smaller than the body it
 * carries, and that gap *is* the hiding mechanic.** Measured off
 * `public/models/player.glb`: the torso is 0.13 half-deep and about 0.33
 * half-wide. A collider of 0.12 therefore lets the back meet a wall it is
 * pressed against instead of stopping a whole body-depth short of it, and lets
 * a shoulder sink well in when standing side-on — which is what makes lying
 * against a surface read as part of it rather than as a figure hovering near it.
 *
 * **It costs nothing in fairness.** A shot raycasts the *visual* mesh
 * (`combat/shoot.ts` against `remoteFigures`), never the collider, so sinking
 * deeper does not make anyone harder to hit — it only changes where they can
 * stand.
 *
 * The collider *does* turn with the figure's yaw — `Player.tsx` hands it one
 * every frame — but this box is square in plan, so one number serves both across
 * and front-to-back. It is set by the shallower of the two, the depth; the cost
 * is that a shoulder clips further than a back does, which flatters the
 * silhouette rather than spoiling it. **Keep it square.** A standing box that is
 * wider one way than the other changes how far you sit off a wall as you turn,
 * and a chameleon on a wall turns freely with Q/E.
 *
 * A hunter is not hiding, so theirs stays honest — and wider, because they are
 * the bigger figure.
 *
 * This is only the *standing* box. A posed chameleon gets its own from
 * `figure/poses.ts`, and `lie` and `curl` are legitimately oblong — they are
 * lying down, so there is no facing left for a turn to spoil. The 0.01 is the
 * whole rule there too: every pose's box is its own body's core less about a
 * centimetre, so a chameleon sinks slightly into whatever they are against
 * whichever way they are folded.
 */
const CHAMELEON = 0.12;
const HUNTER = 0.52;

export const BODY: Record<Role, [hx: number, hy: number, hz: number]> = {
  chameleon: [CHAMELEON, 1, CHAMELEON],
  hunter: [HUNTER, 1.3, HUNTER],
};

/** Downward acceleration, in units per second squared. */
export const GRAVITY = 20;

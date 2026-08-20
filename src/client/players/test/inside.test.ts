import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { keepInside, pushInside } from "../inside.ts";

/**
 * A wall slab centred on x = 0. A box rather than a plane, because that is what
 * the collision proxies are: a plane's back face is culled by `FrontSide` and
 * would only be hit from one direction.
 */
function wall() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 4));
  mesh.updateMatrixWorld(true);
  return [mesh];
}

const at = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);

describe("keeping the body's centre inside the room", () => {
  it("stops a centre that would cross a wall, just short of its face", () => {
    const to = at(1);
    expect(keepInside(at(-1), to, wall())).toBe(true);
    // The slab is 0.2 thick, so its near face is at −0.1 and the centre is held
    // one skin short of it. Never on the face, and never past it.
    expect(to.x).toBeCloseTo(-0.12, 3);
  });

  it("leaves a move that never reaches the wall alone", () => {
    const to = at(-0.5);
    expect(keepInside(at(-1), to, wall())).toBe(false);
    expect(to.x).toBe(-0.5);
  });

  it("leaves a move parallel to the wall alone", () => {
    // Climbing a wall, or walking along one: the centre stays on its own side.
    const to = at(-0.3, 2, 0);
    expect(keepInside(at(-0.3), to, wall())).toBe(false);
    expect(to.y).toBe(2);
  });

  it("catches a teleport, which is the whole point", () => {
    // The foot compensation and `seatOn` move the body outright, and the
    // character controller never sees either — this is the only thing that does.
    const to = at(3);
    keepInside(at(-3), to, wall());
    expect(to.x).toBeLessThan(0);
  });

  it("does nothing before a map has loaded", () => {
    const to = at(1);
    expect(keepInside(at(-1), to, [])).toBe(false);
    expect(to.x).toBe(1);
  });

  it("does nothing when the body has not moved", () => {
    const to = at(-1);
    expect(keepInside(at(-1), to, wall())).toBe(false);
  });
});

const NO_CENTRE = [0, 0, 0] as const;

/** A room: floor at y = −2, ceiling at y = 2, walls at x = ±3. */
function room() {
  const make = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz));
    mesh.position.set(x, y, z);
    mesh.updateMatrixWorld(true);
    return mesh;
  };
  return [
    make(8, 0.4, 8, 0, -2.2, 0), // floor
    make(8, 0.4, 8, 0, 2.2, 0), // ceiling
    make(0.4, 4, 8, -3.2, 0, 0), // west wall
    make(0.4, 4, 8, 3.2, 0, 0), // east wall
  ];
}

describe("keeping the whole box inside the room", () => {
  it("pushes a box that is sticking into a wall back out of it", () => {
    // Half a unit wide, with its centre 0.2 from the wall face at x = −3: a
    // tenth of it is inside the wall.
    const body = at(-2.6);
    expect(pushInside(body, [0.5, 0.5, 0.5], NO_CENTRE, 0, null, room())).toBe(true);
    expect(body.x).toBeCloseTo(-2.5, 3);
  });

  it("leaves a box with room to spare exactly where it is", () => {
    const body = at(0, 0, 0);
    expect(pushInside(body, [0.5, 0.5, 0.5], NO_CENTRE, 0, null, room())).toBe(false);
    expect(body.x).toBe(0);
  });

  it("does not float a box that is resting exactly on the floor", () => {
    // The whole reason for the tolerance: the downward ray hits at exactly the
    // half-extent every frame, and a skin added on top would lift the body a
    // little further each one.
    const body = at(0, -1.5, 0);
    expect(pushInside(body, [0.5, 0.5, 0.5], NO_CENTRE, 0, null, room())).toBe(false);
    expect(body.y).toBe(-1.5);
  });

  it("lets a body out of the ceiling it has grown into", () => {
    // A pose change rebuilds the collider taller around a centre that never
    // moved, which the character controller never sees.
    const body = at(0, 1.6, 0);
    expect(pushInside(body, [0.2, 0.5, 0.2], NO_CENTRE, 0, null, room())).toBe(true);
    expect(body.y).toBeCloseTo(1.5, 3);
  });

  it("centres a box in a gap too narrow to hold it, rather than picking a wall", () => {
    // Wider than the room, so neither side can be satisfied.
    const body = at(1, 0, 0);
    pushInside(body, [4, 0.5, 0.5], NO_CENTRE, 0, null, room());
    expect(body.x).toBeCloseTo(0, 3);
  });

  it("measures along the box's own axes, which turn with the body", () => {
    // Turned a quarter turn, the box's local X now runs along world Z — where
    // this room has no walls at all, so the same overlap is not seen.
    const turned = at(-2.6);
    expect(
      pushInside(turned, [0.5, 0.5, 0.1], NO_CENTRE, Math.PI / 2, null, room()),
    ).toBe(false);
  });

  it("never pushes a clinging body off the surface it is holding", () => {
    // `seatOn` owns that distance. Shoving them off it drops a climber out of
    // reach of their own cling probe.
    const body = at(-2.6);
    const wallNormal = new THREE.Vector3(1, 0, 0);
    expect(pushInside(body, [0.5, 0.5, 0.5], NO_CENTRE, 0, wallNormal, room())).toBe(false);
    expect(body.x).toBe(-2.6);
  });

  it("still lets a climber out of the ceiling while they hold the wall", () => {
    const body = at(-2.6, 1.6, 0);
    const wallNormal = new THREE.Vector3(1, 0, 0);
    expect(pushInside(body, [0.5, 0.5, 0.5], NO_CENTRE, 0, wallNormal, room())).toBe(true);
    // Out of the ceiling, and still against its wall.
    expect(body.y).toBeCloseTo(1.5, 3);
    expect(body.x).toBe(-2.6);
  });

  it("takes the pose's own offset into account, not just the body's position", () => {
    // `curl` carries its box forward and up; the box is what has to clear the
    // wall, wherever the body's origin happens to be.
    const body = at(-2.2);
    expect(pushInside(body, [0.5, 0.5, 0.5], [-0.4, 0, 0], 0, null, room())).toBe(true);
    expect(body.x).toBeCloseTo(-2.1, 3);
  });

  it("does nothing before a map has loaded", () => {
    const body = at(-2.6);
    expect(pushInside(body, [0.5, 0.5, 0.5], NO_CENTRE, 0, null, [])).toBe(false);
    expect(body.x).toBe(-2.6);
  });
});

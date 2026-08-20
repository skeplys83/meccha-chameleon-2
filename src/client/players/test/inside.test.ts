import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { keepInside } from "../inside.ts";

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

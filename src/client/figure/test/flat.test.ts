import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CLING_CEILING, CLING_NONE, CLING_WALL } from "@/shared/protocol";
import { flatFor, turnCentre, turnHalf } from "../flat.ts";

/** Where a body-local direction ends up, rounded so −0 reads as 0. */
const after = (q: THREE.Quaternion, v: [number, number, number]) =>
  new THREE.Vector3(...v)
    .applyQuaternion(q)
    .toArray()
    .map((n) => (Math.abs(n) < 1e-6 ? 0 : +n.toFixed(3)));

/** The figure faces −Z with its head at +Y. */
const HEAD: [number, number, number] = [0, 1, 0];
const BACK: [number, number, number] = [0, 0, 1];
const RIGHT: [number, number, number] = [1, 0, 0];

const FORWARD = [0, 0, -1];
const DOWN = [0, -1, 0];
const UP = [0, 1, 0];

describe("lying on the floor, on its back", () => {
  it("puts the back down and the head forward", () => {
    // Both at once. Tipping about X alone gets the back down and swings the
    // head to +Z — a body that lies down feet-first slides feet-first when you
    // walk, which is how that was caught.
    expect(after(flatFor("back", CLING_NONE), BACK)).toEqual(DOWN);
    expect(after(flatFor("back", CLING_NONE), HEAD)).toEqual(FORWARD);
  });

  it("never lays the body on a shoulder", () => {
    const [, y] = after(flatFor("back", CLING_NONE), RIGHT);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });
});

describe("lying on its side", () => {
  it("puts a shoulder down and keeps the back facing sideways", () => {
    const [, y] = after(flatFor("side", CLING_NONE), RIGHT);
    expect(Math.abs(y)).toBeCloseTo(1);
    expect(after(flatFor("side", CLING_NONE), BACK)).toEqual([0, 0, 1]);
  });

  it("never stands up, on any surface", () => {
    for (const surface of [CLING_WALL, CLING_CEILING]) {
      expect(after(flatFor("side", surface), HEAD), `surface ${surface}`).toEqual(
        after(flatFor("side", CLING_NONE), HEAD),
      );
    }
  });
});

describe("holding on", () => {
  it("treats a ceiling exactly like a wall, for every mode", () => {
    // The rule that made the corner between them work: a `back` pose lying on a
    // ceiling is long along its forward axis, and you face a wall to climb it,
    // so reaching the ceiling drove a body-length of collider into that wall.
    for (const mode of ["back", "side", "none"] as const) {
      expect(after(flatFor(mode, CLING_CEILING), HEAD), mode).toEqual(
        after(flatFor(mode, CLING_WALL), HEAD),
      );
      expect(after(flatFor(mode, CLING_CEILING), BACK), mode).toEqual(
        after(flatFor(mode, CLING_WALL), BACK),
      );
    }
  });

  it("stands `back` upright, because a body on its back cannot grip", () => {
    expect(after(flatFor("back", CLING_WALL), HEAD)).toEqual(UP);
    expect(after(flatFor("back", CLING_WALL), BACK)).toEqual([0, 0, 1]);
  });

  it("leaves `none` alone", () => {
    expect(after(flatFor("none", CLING_WALL), HEAD)).toEqual(UP);
  });

  it("leaves a pose that never lies flat exactly upright, on any surface", () => {
    for (const surface of [CLING_NONE, CLING_WALL, CLING_CEILING]) {
      expect(after(flatFor("none", surface), HEAD)).toEqual(UP);
    }
  });
});

describe("the box that follows the body", () => {
  /** A standing body: narrow, tall, shallow. */
  const STANDING: [number, number, number] = [0.12, 1.1, 0.12];

  it("lays a standing box down so the body rests on the floor", () => {
    // The bug this exists to stop: a pose flagged flat kept its standing box
    // and hung 1.1 units in the air inside it.
    const [x, y, z] = turnHalf(STANDING, flatFor("back", CLING_NONE));
    expect(y).toBeCloseTo(0.12);
    expect(z).toBeCloseTo(1.1);
    expect(x).toBeCloseTo(0.12);
  });

  it("gives `lie` back exactly the box it always had", () => {
    // Stated standing as [0.23, 0.96, 0.12]; on its side that is the original.
    const turned = turnHalf([0.23, 0.96, 0.12], flatFor("side", CLING_NONE));
    expect(turned.map((n) => +n.toFixed(3))).toEqual([0.96, 0.23, 0.12]);
  });

  it("leaves the box standing whenever `back` is holding on", () => {
    // And this is what keeps it out of the corner: held, the long axis is
    // vertical and hangs into the room rather than into the wall.
    expect(turnHalf(STANDING, flatFor("back", CLING_WALL))).toEqual(STANDING);
    expect(turnHalf(STANDING, flatFor("back", CLING_CEILING))).toEqual(STANDING);
    expect(turnHalf(STANDING, flatFor("none", CLING_NONE))).toEqual(STANDING);
  });

  it("keeps `side`'s box lying down everywhere", () => {
    const lie: [number, number, number] = [0.23, 0.96, 0.12];
    for (const surface of [CLING_NONE, CLING_WALL, CLING_CEILING]) {
      expect(turnHalf(lie, flatFor("side", surface)), `surface ${surface}`).toEqual([
        0.96, 0.23, 0.12,
      ]);
    }
  });

  it("keeps a centre's sign, unlike a half-extent", () => {
    // A centre is a real offset: an inch toward the head has to end up an inch
    // *forward* once the head is pointing forward, not an inch backward.
    const [, , z] = turnCentre([0, 0.1, 0], flatFor("back", CLING_NONE));
    expect(z).toBeCloseTo(-0.1);
  });
});

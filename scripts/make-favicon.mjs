#!/usr/bin/env node
/**
 * Paints a chameleon's head and writes it to public/icon.svg.
 *
 *     npm run favicon          # a new random paint job
 *     npm run favicon 33       # the one currently committed
 *
 * Every run prints its seed, so you can re-roll until you like one and then pin
 * it by passing that number back.
 *
 * The colours come from `src/game/paint/palette.ts` — the same table the swatch
 * row and the arena use — so the icon can never drift from the game's palette.
 *
 * The head is a sphere, so the dots are projected like paint on a sphere: a dot
 * near the silhouette is squashed along the radial direction by the cosine of
 * its angle from the viewer, which is what stops it reading as a flat sticker.
 * Dots are laid in short drags of 3–5, because that is what the brush actually
 * produces when you paint yourself in-game.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAINT } from "../src/game/paint/palette.ts";

const OUT = fileURLToPath(new URL("../public/icon.svg", import.meta.url));

const SIZE = 64;
const C = SIZE / 2;
/** As large as the tile allows — at 16px every pixel of head counts. */
const R = 26;

/** Seeded so a paint job you like can be pinned. */
const seed = Number(process.argv[2] ?? Math.floor(Math.random() * 1e9));
function rng(s) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
const between = (lo, hi) => lo + rand() * (hi - lo);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

// White is the head's own colour and grey barely reads against it, so neither
// makes a usable splash.
const COLOURS = Object.entries(PAINT)
  .filter(([name]) => name !== "white" && name !== "grey")
  .map(([, hex]) => hex);

const round = (n) => Math.round(n * 100) / 100;

/** One dot, as it lands on a sphere seen head-on. */
function dot(nx, ny, nz, radius, colour) {
  // Behind the horizon — not visible from here.
  if (nz <= 0.12) return null;
  const x = C + R * nx;
  const y = C - R * ny;
  // Squash along the radial direction by how far the surface has turned away.
  const rx = radius * nz;
  const angle = (Math.atan2(-ny, nx) * 180) / Math.PI;
  return (
    `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(Math.max(0.6, rx))}" ` +
    `ry="${round(radius)}" fill="${colour}" ` +
    `transform="rotate(${round(angle)} ${round(x)} ${round(y)})"/>`
  );
}

/**
 * A short brush drag: several overlapping dots walking across the surface.
 *
 * Positions are chosen on the *projected* disk rather than by spherical angles.
 * Sampling theta/phi directly piles everything around the pole — which, seen
 * head-on, means every splash lands on the forehead. `r = √u` spreads them
 * evenly across the face instead, and `nz` falls out of the radius.
 */
function stroke(taken) {
  const colour = pick(COLOURS);

  // Start somewhere on the visible face, nudged apart from earlier strokes so
  // the paint does not all pile into one corner.
  let px = 0;
  let py = 0;
  for (let tries = 0; tries < 14; tries++) {
    const r = 0.88 * Math.sqrt(rand());
    const a = between(0, Math.PI * 2);
    px = r * Math.cos(a);
    py = r * Math.sin(a);
    if (!taken.some(([tx, ty]) => Math.hypot(px - tx, py - ty) < 0.6)) break;
  }
  taken.push([px, py]);

  const heading = between(0, Math.PI * 2);
  const stepLength = between(0.06, 0.13);
  const radius = between(3.0, 6.0);
  const steps = Math.floor(between(3, 6));

  const out = [];
  for (let i = 0; i < steps; i++) {
    const d2 = px * px + py * py;
    if (d2 > 0.97) break; // walked off the silhouette
    const nz = Math.sqrt(1 - d2);
    const d = dot(px, py, nz, radius * between(0.85, 1.1), colour);
    if (d) out.push(d);
    px += Math.cos(heading) * stepLength + between(-0.02, 0.02);
    py += Math.sin(heading) * stepLength + between(-0.02, 0.02);
  }
  return out.join("");
}

const strokes = [];
const taken = [];
const count = Math.floor(between(3, 6));
for (let i = 0; i < count; i++) strokes.push(stroke(taken));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <title>Meccha Chameleon — a painted chameleon</title>
  <defs>
    <clipPath id="head"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
    <radialGradient id="lit" cx="38%" cy="30%" r="78%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#efefef"/>
      <stop offset="1" stop-color="#b4b4b4"/>
    </radialGradient>
  </defs>
  <!-- The dark tile is what makes a white head legible on a light tab bar. -->
  <rect width="${SIZE}" height="${SIZE}" rx="12" fill="#0a0a0a"/>
  <circle cx="${C}" cy="${C}" r="${R}" fill="url(#lit)"/>
  <g clip-path="url(#head)">${strokes.join("")}</g>
  <!-- Re-seat the shading over the paint so the whole head reads as one sphere. -->
  <circle cx="${C}" cy="${C}" r="${R}" fill="url(#lit)" opacity="0.22"/>
  <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#000000" stroke-opacity="0.25"/>
</svg>
`;

writeFileSync(OUT, svg, "utf-8");
console.log(`painted a chameleon with seed ${seed}`);
console.log(`  ${count} strokes, ${svg.match(/<ellipse/g)?.length ?? 0} dots`);
console.log(`  -> public/icon.svg (${svg.length} bytes)`);
console.log(`  re-roll: npm run favicon    ·    keep this one: npm run favicon ${seed}`);

/**
 * Merge duplicate mesh data in an exported level, in place.
 *
 * Driven by export-level.sh — run that rather than this.
 *
 *     node scripts/optimize-level.mjs public/maps/dungeon.glb
 *
 * This exists for one bug in particular. `batch()` in `world/levelScene.ts`
 * groups by geometry identity, so a piece duplicated with `shift+D` instead of
 * `alt+D` becomes its own draw call — invisible in Blender, and it once took the
 * dungeon from 15 draw calls to 75 and doubled the file. `dedup` merges meshes
 * and accessors that are byte-identical, so the mistake stops mattering.
 *
 * Deliberately *only* `dedup`. `prune` removes unused resources, which sounds
 * safe and is, but nothing here needs it: on this map it removed nothing dedup
 * had not already, so it is cost without benefit. Compression is the next thing
 * to reach for, and `world/CLAUDE.md` invariant 11 says which and in what order.
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup } from "@gltf-transform/functions";
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/optimize-level.mjs <file.glb>");
  process.exit(1);
}

// Without the extensions registered this throws on `KHR_lights_punctual`
// rather than quietly dropping every light in the map — but only because the
// exporter marks it *required*. Register them all and nothing is at risk.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const doc = await io.read(path);
const root = doc.getRoot();

const census = (r) => ({
  meshes: r.listMeshes().length,
  accessors: r.listAccessors().length,
  nodes: r.listNodes().length,
  colliders: r.listNodes().filter((n) => /^col(_|hull_|tri_|ball_)/.test(n.getName())).length,
  lights: r.listNodes().filter((n) => n.getExtension("KHR_lights_punctual")).length,
});

const before = census(root);
const beforeKb = Math.round(fs.statSync(path).size / 1024);

await doc.transform(dedup());

const after = census(root);

// Dedup must merge *data*, never change what the level is made of. If any of
// these moved, something is wrong and the file is left as the exporter wrote it.
for (const key of ["nodes", "colliders", "lights"]) {
  if (before[key] !== after[key]) {
    console.error(
      `  ! refusing to write: dedup changed ${key} ${before[key]} -> ${after[key]}`,
    );
    process.exit(1);
  }
}

await io.write(path, doc);
const afterKb = Math.round(fs.statSync(path).size / 1024);

if (before.meshes !== after.meshes || beforeKb !== afterKb) {
  console.log(
    `  deduped ${before.meshes} -> ${after.meshes} meshes, ` +
    `${before.accessors} -> ${after.accessors} accessors, ${beforeKb}K -> ${afterKb}K`,
  );
}

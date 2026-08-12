#!/usr/bin/env node
/**
 * Every model committed under `public/maps/` must be placed by a map, and every
 * model a map places must be committed.
 *
 * The dungeon exists to show off the whole of KayKit's pack, so an unused file
 * is not a harmless spare: it is 30 KB in the repo and a piece somebody meant to
 * place and did not. The other direction is worse — a placement naming a missing
 * file suspends `Room` forever and the map never appears, with nothing in the
 * console but a failed fetch.
 *
 * Reads the map registry directly. That works because `world/maps.ts` and
 * everything under it are plain data with no React and no three.js in them, and
 * because they import each other by relative `.ts` path rather than through the
 * `@/` alias the bundler owns. Node strips the types itself.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { MAPS } = await import(path.join(root, "src/game/world/maps.ts"));

let failed = false;
const fail = (msg) => {
  console.error(msg);
  failed = true;
};

/** Which files each map asks for, grouped by the directory they live in. */
const wanted = new Map(); // dir -> Map<file, mapId[]>
for (const map of Object.values(MAPS)) {
  for (const src of map.models) {
    const dir = path.posix.dirname(src);
    if (!wanted.has(dir)) wanted.set(dir, new Map());
    const files = wanted.get(dir);
    files.set(path.posix.basename(src), [...(files.get(path.posix.basename(src)) ?? []), map.id]);
  }
}

for (const [dir, files] of wanted) {
  const onDisk = new Set(
    readdirSync(path.join(root, "public", dir)).filter((f) => f.endsWith(".gltf")),
  );

  for (const [file, mapIds] of files) {
    if (!onDisk.has(file)) {
      fail(`missing asset: ${dir}/${file} is placed by ${mapIds.join(", ")} but not committed`);
    }
  }

  const unused = [...onDisk].filter((f) => !files.has(f)).sort();
  if (unused.length) {
    fail(
      `${unused.length} model${unused.length === 1 ? "" : "s"} in public${dir} ` +
        `${unused.length === 1 ? "is" : "are"} committed but never placed:\n  ` +
        unused.join("\n  "),
    );
  }
}

if (failed) {
  console.error(
    "\nPlace the model in the map that owns that folder, or delete the file.\n" +
      "See invariant 12 in src/game/world/CLAUDE.md.",
  );
  process.exit(1);
}

const total = [...wanted.values()].reduce((n, files) => n + files.size, 0);
console.log(`check-map-assets: ${total} models, all placed and all present.`);

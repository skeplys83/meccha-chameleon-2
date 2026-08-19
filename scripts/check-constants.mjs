#!/usr/bin/env node
/**
 * Refuses a commit that defines a `shared/protocol.ts` constant a second time.
 *
 * This repo's whole shape came out of deleting mirrored constants — four pairs
 * that each existed twice with a comment begging the next person to change both.
 * A duplicate is worse than a wrong value: the copy nobody reads is the one
 * you'll find first and edit, and nothing happens. That is not hypothetical.
 * `WHISTLE_INTERVAL_MS` was moved into protocol.ts and the old copy was left
 * behind, so the obvious knob was a dead one for a whole commit.
 *
 * Re-exports (`export { ROOM_HALF }`) are fine and deliberate — `world/Room.tsx`
 * and `figure/poses.ts` both do it so callers can import from the folder that
 * owns the concept. Only a second *definition* is a lie.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PROTOCOL = "src/shared/protocol.ts";
const ROOT = "src";
const IGNORED = new Set(["node_modules", ".next", ".git"]);

/** `export const NAME =` — a definition. Not `export { NAME }`, a re-export. */
const DEFINES = /^export const ([A-Za-z_$][\w$]*)\s*[:=]/gm;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const names = (src) => [...src.matchAll(DEFINES)].map((m) => m[1]);

let protocol;
try {
  protocol = readFileSync(PROTOCOL, "utf8");
} catch {
  process.exit(0); // not this project's layout any more; nothing to guard
}

const shared = new Set(names(protocol));
const clashes = [];

for (const file of walk(ROOT)) {
  if (path.normalize(file) === path.normalize(PROTOCOL)) continue;
  const src = readFileSync(file, "utf8");
  for (const name of names(src)) {
    if (shared.has(name)) clashes.push({ file, name });
  }
}

if (!clashes.length) process.exit(0);

console.error("\n  A shared constant is defined twice.\n");
for (const { file, name } of clashes) {
  console.error(`  ${name} is defined in ${file}`);
  console.error(`      and in ${PROTOCOL}, which is the one everything reads.\n`);
}
console.error("  Delete the copy and import it from shared/protocol.ts. If the two are");
console.error("  genuinely different quantities, give them different names.\n");
process.exit(1);

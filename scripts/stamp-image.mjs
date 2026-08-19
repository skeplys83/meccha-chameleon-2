#!/usr/bin/env node
/**
 * Stamps `docker-compose.yml`'s image tag with the current commit.
 *
 * The VPS builds this repo itself, so there is no registry to push to and no
 * "re-pull image" switch to flip. What makes a deploy happen is the image
 * *name* changing: `docker compose up` builds a service only when no local
 * image by that name exists. A tag that never changes is a deploy that never
 * happens, which is exactly the bug this exists to prevent.
 *
 * Run it, commit, push. Portainer's git poll sees the changed compose file,
 * pulls, and finds it has no `superchameleon:<sha>` — so it builds one.
 *
 * The stamp lands one commit "behind" itself: you stamp at HEAD, then commit.
 * That is correct rather than sloppy — `docker-compose.yml` is in
 * `.dockerignore`, so the stamping commit changes nothing the build can see.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const COMPOSE = "docker-compose.yml";
const LINE = /^(\s*image:\s*superchameleon:)(\S+)\s*$/m;

const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

const before = readFileSync(COMPOSE, "utf8");
const match = before.match(LINE);

if (!match) {
  console.error(`  no "image: superchameleon:<tag>" line in ${COMPOSE}`);
  process.exit(1);
}

if (match[2] === sha) {
  console.error(`  already stamped ${sha} — commit something before releasing,`);
  console.error(`  or the VPS will find the image it already has and not rebuild.`);
  process.exit(1);
}

writeFileSync(COMPOSE, before.replace(LINE, `$1${sha}`));
console.log(`  ${match[2]} -> ${sha}`);
console.log(`  now: git commit -am "Release ${sha}" && git push`);

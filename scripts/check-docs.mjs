#!/usr/bin/env node
/**
 * Refuses a commit that changes a folder's code without touching that folder's
 * CLAUDE.md.
 *
 * The docs in this repo are the only thing a fresh session reads before editing.
 * A convention that they be kept current is exactly what was failing, so this is
 * a gate instead: every directory containing a CLAUDE.md is a "domain", and
 * staging code in a domain stages its doc too.
 *
 * It cannot tell whether the edit was *good* — only that it happened. That is
 * still the difference between a doc that drifts silently and one that gets a
 * deliberate "no change needed" glance every time.
 *
 * Escape hatch: SKIP_DOC_CHECK=1 git commit …   (formatting passes, mass renames)
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const DOC = "CLAUDE.md";

/** Files that are documentation or tooling in their own right. */
const EXEMPT = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "README.md",
  ".gitignore",
]);

/**
 * Paths the root CLAUDE.md does not claim. Everything else that is not inside a
 * documented folder falls through to it — chiefly Game.tsx and Scene.tsx, the
 * composition roots, which belong to no folder.
 *
 * `index.html`, `src/main.tsx` and `src/index.css` are *not* here on purpose:
 * they are the client entry point, the root doc describes them, and a change to
 * how the app boots is exactly the kind that should make somebody re-read it.
 */
const UNCLAIMED = [
  "public/",
  "scripts/",
  ".githooks/",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "eslint.config.mjs",
];

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);

if (process.env.SKIP_DOC_CHECK === "1") process.exit(0);

const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACMR");
if (!staged.length) process.exit(0);

const IGNORED = new Set(["node_modules", ".next", ".git", ".githooks"]);

/**
 * Every domain in the repo, found rather than hard-coded, so a new folder with a
 * CLAUDE.md is covered the moment it exists.
 *
 * Read off the working tree, not `git ls-files`: a brand new folder whose doc is
 * not staged yet must still count as a domain, or the very act of forgetting to
 * stage the doc would make the folder invisible to this check.
 */
function findDomains(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  if (entries.some((e) => e.isFile() && e.name === DOC)) out.push(dir);
  for (const e of entries) {
    if (!e.isDirectory() || IGNORED.has(e.name)) continue;
    findDomains(path.join(dir === "." ? "" : dir, e.name), out);
  }
  return out;
}

const domains = findDomains(".");

const stagedSet = new Set(staged);

/** The most specific domain containing a file — nested docs win over their parents. */
const domainOf = (file) => {
  const best = domains
    .filter((d) => d === "." || file === d || file.startsWith(`${d}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  // The root doc covers the composition roots and src/app, but not tooling,
  // assets or config — those have no prose to keep current.
  if (best === "." && UNCLAIMED.some((u) => file === u || file.startsWith(u))) return null;
  return best;
};

const stale = new Map();
for (const file of staged) {
  if (EXEMPT.has(path.basename(file))) continue;
  const domain = domainOf(file);
  if (!domain) continue;
  if (stagedSet.has(path.join(domain, DOC))) continue;
  if (!stale.has(domain)) stale.set(domain, []);
  stale.get(domain).push(file);
}

if (!stale.size) process.exit(0);

console.error("\n  Documentation is out of date with this commit.\n");
for (const [domain, files] of stale) {
  const label = domain === "." ? DOC : `${domain}/${DOC}`;
  console.error(`  ${label} was not touched, but you changed:`);
  for (const f of files.slice(0, 6)) console.error(`      ${f}`);
  if (files.length > 6) console.error(`      … and ${files.length - 6} more`);
  console.error("");
}
console.error("  Update each doc — its Invariants and Contracts sections are the point —");
console.error("  then `git add` it. If the change genuinely does not affect the docs:\n");
console.error("      SKIP_DOC_CHECK=1 git commit …\n");
process.exit(1);

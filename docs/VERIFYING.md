# Verifying changes

```bash
npx tsc --noEmit && npx eslint . && npm run build
```

Those three are the gates; run `npm run build` before calling anything done.

**Maps are not covered by any of them.** A `.glb` is data the build never looks
at, so a level whose spawn point has moved, whose collision no longer reaches
the walls, or which is missing entirely typechecks and builds perfectly. Two
things cover that instead: `checkLevel` warns in the browser console at load
(see `world/CLAUDE.md`, invariant 12), and the level can be parsed and measured
in Node without a browser — "Checking a level without a browser" in the same
file has the recipe, and it is worth running after any large edit in Blender.

**Do not drive the game in a browser.** Chrome automation is not part of this
project's workflow — **the user tests the running game manually and reports what
they see and hear.** It also cannot work: the agent's tab reports
`visibilityState: "hidden"`, so Chrome refuses `requestPointerLock()` — putting a
hunter's aim and trigger out of reach — and withholds the user activation an
`AudioContext` needs, so nothing is ever audible. Time spent there is wasted.

What you *can* verify on your own, and should:

- **Types, lint and build.** They catch most of a refactor.
- **The protocol, headlessly.** Drive two or three `colyseus.js` clients from a
  scratch `.mjs` script in the project root (so `node_modules` resolves) against a
  running server, assert what each client sees, then delete the script. Join,
  clamping, relay-and-not-echo, the late-joiner backlog, kill rules and fire-rate
  limiting are all checkable this way in about 60 lines.
- **Pure logic, headlessly.** Modules with no React or WebGL in them — the
  footstep stepper, stroke encoding, pose extents — import straight into Node,
  since it strips types. A throwaway resolve hook maps the `@/` alias:

  ```js
  export async function resolve(spec, ctx, next) {
    if (!spec.startsWith("@/")) return next(spec, ctx);
    /* map "@/x" -> "./src/x", append .ts if missing, then */ return next(mapped, ctx);
  }
  ```

- **Audio levels, with ffmpeg.** `ffmpeg -i f.wav -af volumedetect -f null /dev/null`
  reports peak and mean. A sound nobody can hear is usually 20 dB down, not
  unwired — see `sound/CLAUDE.md`.
- **SVG, with `qlmanage`, never ImageMagick.** `qlmanage -t -s 512 -o outdir
  file.svg` renders through WebKit and is what a browser will show. ImageMagick's
  built-in SVG renderer ignores gradients and will report a perfectly good icon as
  a black circle — it cost a wrong diagnosis once already.

Anything about feel — figure proportions, camera behaviour, gun placement, whether
a sound sits right in the mix, whether the arena plays well — **is the user's
call**. Say plainly what you checked and what you did not, rather than implying it
was all confirmed.

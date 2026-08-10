# Meccha Chameleon

A LAN-only multiplayer hide-and-seek game. Hiders are stick figures who can lie
on their side to pass as scenery; seekers hunt them in first person with a
shotgun. No internet, no accounts, **not deployed to Vercel** — everything runs
on machines on the same Wi-Fi.

## How the docs work

**This is the only doc that is not about one folder.** Everything else lives next
to the code it describes: each folder under `src/game/` has its own `CLAUDE.md`
holding that folder's invariants — the rule with the bug it prevents attached —
and its contracts with the folders around it.

**Read the doc for the folder you are about to edit, and update it in the same
change.** The pre-commit hook enforces the second half: staging code without
staging the `CLAUDE.md` that covers it fails the commit. It also runs
`scripts/check-constants.mjs`, which fails if a `shared/protocol.ts` constant is
*defined* a second time anywhere — the one class of bug this layout exists to
prevent, and one I have already reintroduced once. Enable it once per clone
with `git config core.hooksPath .githooks`; run it any time with
`npm run check:docs`. The escape hatch for a genuine no-op is
`SKIP_DOC_CHECK=1 git commit`.

Anything not inside a documented folder — `Game.tsx`, `Scene.tsx`, `src/app/` —
is covered by this file.

## Run it

```bash
npm run dev     # node src/game/server/index.ts — Next on :3000, Colyseus on :2567
npm run build   # next build
npm start       # same server, NODE_ENV=production
```

**The server is TypeScript with no build step.** Node 22.18+ / 23.6+ strips the
types itself, so `node src/game/server/index.ts` just runs. `"type": "module"` in
package.json is what stops Node reparsing it as CommonJS first.

`npm run dev` does **not** run `next dev`. It runs the custom server, which prints
the localhost URL, the LAN URL and the Colyseus port. Other players open the LAN
URL.

Useful env vars: `PORT` (web, default 3000), `GAME_PORT` (Colyseus, default 2567),
`SESSION_NAME` (overrides the auto-generated session title).

## Stack

- Next.js 16.3 App Router, React 19, TypeScript, Tailwind v4, Turbopack
- three.js + `@react-three/fiber` + `@react-three/drei`
- `@react-three/rapier` for physics
- **Colyseus 0.16** server + `colyseus.js` 0.16 client, `@colyseus/schema` v3

### Version constraint — do not "upgrade" Colyseus casually

`colyseus@latest` is 0.17 (schema v4) but the browser client `colyseus.js` only
goes up to 0.16 (schema v3). Mixing them is a protocol mismatch and npm refuses
to resolve it. The whole stack is deliberately pinned to the 0.16 / schema-3
line. Bump all three together or not at all.

## The map

```
src/app/page.tsx    renders <Game />
src/app/icon.svg    the favicon — generated, see below
src/game/
  Game.tsx          top-level state: role, session, paused, painting, killed
  Scene.tsx         Canvas, lights, Physics, mark and grave lifetimes
public/sounds/      the five .wav files
public/maps/        model assets for maps that use them
scripts/            check-docs.mjs, check-constants.mjs, make-favicon.mjs
```

**The favicon is generated, not drawn.** `npm run favicon` paints a hider's head
— a shaded sphere with a few random brush drags — and writes `src/app/icon.svg`.
It reads the real `PAINT` table from `paint/palette.ts`, so the icon can never
drift from the game's palette, and it projects each dot onto the sphere (squashed
along the radial direction by its angle from the viewer) so the paint sits on a
ball rather than on a sticker. Every run prints its seed; re-roll until you like
one, then pin it with `npm run favicon <seed>`. The committed one is seed 33.
Next picks `icon.svg` up automatically — there is no `favicon.ico` and no
`<link>` tag to maintain.

| folder     | owns                                                 | read it before touching                       |
| ---------- | ---------------------------------------------------- | --------------------------------------------- |
| `shared/`  | `Role` and the constants both halves must agree on   | anything the server also reads                |
| `server/`  | Colyseus room, schema, UDP discovery, HTTP bootstrap | messages, validation, authority               |
| `net/`     | the Colyseus **client**, remotes, LAN session list   | joining, remote transforms, events            |
| `world/`   | the maps, and the registry that picks one            | room layout, collision, cover, adding a map   |
| `figure/`  | the stick figure rig, the poses, `PART_SHAPE`        | proportions, poses, limb geometry             |
| `paint/`   | canvases, brush, palette, the panel                  | painting, brushes, skins, colours             |
| `players/` | the local player and the remote ones, `BODY`         | controls, camera, movement, jumping, climbing |
| `combat/`  | the shotgun, the viewmodel, marks, graves            | shooting, death, hit feedback                 |
| `sound/`   | the audio engine, the catalogue, footsteps           | anything that makes a noise                   |
| `hud/`     | the 2D overlays outside the Canvas                   | menus, legends, name entry                    |

`Game.tsx` and `Scene.tsx` are the composition roots and belong to no folder.
`Scene.tsx` also owns the `<Physics>` settings — see trap 4, which is the reason
the timestep is not the library default.
Every mode transition in the game is decided in `Game.tsx` — which also means it
owns the *teardown* of each: joining unlocks audio, pausing suspends it, and
dying or leaving stops every looping sound. It owns the seeker's pointer lock the
same way, held for as long as they are playing at all rather than re-taken by
each button that hands control back — which is also why Esc raises the pause menu
but cannot dismiss it, since asking for the lock with the key that just released
it is refused by the browser. Anything that outlives its player, or fails to come
back with it, is a bug that lands here.

## How the folders may depend on each other

**`src/game/server/` is a different runtime.** It sits under `src/game/` for
convenience but runs in Node, never reaches the browser, and may import *only*
from `shared/`. Nothing outside it may import from it. That boundary is the one
thing the folder layout no longer implies, so it is written down here.

Everything else is browser code and may mix freely. Two pairs lean on each other
in both directions, and both are known rather than accidental:

- `paint/` ↔ `figure/` — the brush needs the real limb sizes (`figure/parts.ts`);
  the figure needs the canvases to wear (`paint/skin.ts`).
- `players/` ↔ `combat/` — `Player` pulls the trigger; `combat/shoot.ts` raycasts
  `remoteFigures`, which `players/RemotePlayers` publishes.

Both are acyclic at the module level. `hud/` is the one folder with a hard rule:
it renders outside the Canvas and must not import from `world/`, `figure/`,
`players/` or `combat/` — it talks to the game through `Game.tsx` props and
through `net/`. Reading `POSES` for a label is the allowed exception.

## Traps already hit — do not reintroduce

The folder docs hold the rest. These seven are project-wide:

1. **`reactStrictMode: false` in `next.config.ts` is load-bearing.** R3F's `Canvas`
   does not survive StrictMode's dev-only double mount: the discarded mount calls
   `forceContextLoss()` and the canvas stays dead. Symptom is a black screen and
   `THREE.WebGLRenderer: Context Lost.`
2. **Never let a WebSocket server own the HTTP server's `upgrade` event.**
   `new WebSocketServer({ server, path })` destroys every non-matching upgrade,
   including Next's dev HMR socket, which stops the client bootstrap so **React
   never hydrates and no button works**. Colyseus is on its own port precisely to
   avoid this. Symptom is "connection refused" plus a completely dead UI.
3. **No CDN assets.** `<Environment preset="city" />` fetches an HDR at runtime
   and, under one `Suspense`, blanks the whole scene. Lighting is plain lights.
   Name labels use drei `Html`, not `Text` (troika fetches a font). This is a LAN
   game; there may be no internet at all.
4. **`<Physics timeStep="vary">` in `Scene.tsx` is load-bearing.** On the
   default fixed 1/60 step, @react-three/rapier renders every body at an
   *interpolated* transform each frame while `rb.translation()` — which the
   camera and every raycast in `players/Player.tsx` read — only changes on a
   step. Two clocks, drifting apart by up to one step, which shows as the figure
   jittering against the camera at one-frame intervals. Stepping once per
   rendered frame makes the interpolation alpha 1 and the two always agree.
5. **Never call into rapier from a React effect — only from `useFrame`.** A handle
   touched after its world is gone (an HMR remount is enough) panics inside wasm:
   one `RuntimeError: unreachable`, then an endless flood of `recursive use of an
   object detected which would lead to unsafe aliasing in rust`. The module is
   then poisoned, *every* later rapier call throws, physics is dead and the frame
   loop aborts halfway — which looks like the player teleporting into the ground
   and the screen going white. Colliders are swapped by React (a `key` on
   `CuboidCollider`) rather than mutated in place.
6. **Write TypeScript that Node can strip.** Node blanks type syntax out rather
   than re-emitting, which forbids `enum`, `namespace`, decorators and
   `constructor(private x)` parameter properties. It applies to `server/`, which
   Node runs, *and* to any module you want to import into Node for testing.
   Two specific bites, both already paid for:
   - Colyseus schema fields must be `declare x: T`, never `x!: T` — the latter
     survives as the class field `x;`, an own property that shadows the accessor
     `defineTypes` installs, and every state encode then dies with `Cannot read
     properties of undefined (reading 'Symbol(Symbol.metadata)')`, taking the
     server down on the first join.
   - A parameter property throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` the moment
     the module is loaded outside the bundler.
7. **Nothing here deploys to Vercel.** Ignore Vercel-shaped advice; a LAN game
   should not round-trip the internet.

## Verifying changes

```bash
npx tsc --noEmit && npx eslint . && npm run build
```

Those three are the gates; run `npm run build` before calling anything done.

**Do not drive the game in a browser.** Chrome automation is not part of this
project's workflow — **the user tests the running game manually and reports what
they see and hear.** It also cannot work: the agent's tab reports
`visibilityState: "hidden"`, so Chrome refuses `requestPointerLock()` — putting a
seeker's aim and trigger out of reach — and withholds the user activation an
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

## Not built yet

No round flow (hide phase, win condition), no lobby or ready-up, no health — a
hit is instantly fatal. The whistle is a periodic tell **hiders** give off, not a
round bell: it is heard from wherever its owner is standing, and seekers never
make one. Paint has no undo and
no per-part erase. Each folder's doc ends with the gaps specific to it.

# Ignore these links
https://kenney.nl/assets/category:3D
https://kaylousberg.itch.io/kaykit-dungeon-pack
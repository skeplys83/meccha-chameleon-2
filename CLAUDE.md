@AGENTS.md

# Meccha Chameleon

A LAN-only multiplayer hide-and-seek game. Hiders are stick figures who can lie
on their side to pass as scenery; seekers hunt them in first person with a
shotgun. No internet, no accounts, **not deployed to Vercel** — everything runs
on machines on the same Wi-Fi.

## How the docs work

This file is a map, not a manual. The detail lives next to the code: **every
folder below has its own `CLAUDE.md`, and you read the one for the folder you
are about to edit.** Each carries that folder's invariants — the rules with the
bug they prevent attached — and its contracts with the folders around it.

**Update that doc in the same change.** A pre-commit hook enforces it: staging
code in a folder without staging its `CLAUDE.md` fails the commit. Enable it once
per clone with `git config core.hooksPath .githooks`; run it yourself any time
with `npm run check:docs`. The escape hatch for a genuine no-op is
`SKIP_DOC_CHECK=1 git commit`.

## Run it

```bash
npm run dev     # node src/game/server/index.ts — Next on :3000, Colyseus on :2567
npm run build   # next build
npm start       # same server, NODE_ENV=production
```

**The server is TypeScript with no build step.** Node 22.18+ / 23.6+ strips the
types itself, so `node src/game/server/index.ts` just runs. `"type": "module"`
in package.json is what stops Node reparsing it as CommonJS first.

`npm run dev` does **not** run `next dev`. It runs the custom server, which
prints the localhost URL, the LAN URL and the Colyseus port. Other players open
the LAN URL.

Useful env vars: `PORT` (web, default 3000), `GAME_PORT` (Colyseus, default
2567), `SESSION_NAME` (overrides the auto-generated session title).

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

## Where everything is

```
src/app/page.tsx         renders <Game />
src/game/
  Game.tsx               top-level state: role, session, paused, painting, killed
  Scene.tsx              Canvas, lights, Physics, mark and grave lifetimes
  shared/                Role + the constants both halves must agree on
  server/                Colyseus room, schema, UDP discovery, HTTP bootstrap
  net/                   the Colyseus *client*, remotes, session discovery
  world/                 the arena: shell, obstacles, ROOM_SURFACE
  figure/                the stick figure rig, the poses, PART_SHAPE
  paint/                 canvases, brush, palette, the panel
  players/               the local player and the remote ones, BODY
  combat/                shotgun, viewmodel, marks, graves
  hud/                   the 2D overlays and the role menu
scripts/check-docs.mjs   the doc-freshness gate
```

**`src/game/server/` is a different runtime.** It lives with the client for
convenience but runs in Node, never reaches the browser, and may import only from
`shared/`. Nothing outside it may import from it.

`src/game/CLAUDE.md` explains how the rest may depend on each other and carries
the rules that belong to no single folder — chiefly **never call into rapier from
a React effect, only from `useFrame`**, and **no CDN assets**.

## Traps already hit — do not reintroduce

The folder docs hold the rest. These five are project-wide:

1. **`reactStrictMode: false` in `next.config.ts` is load-bearing.** R3F's
   `Canvas` does not survive StrictMode's dev-only double mount: the discarded
   mount calls `forceContextLoss()` and the canvas stays dead. Symptom is a black
   screen and `THREE.WebGLRenderer: Context Lost.`
2. **Never let a WebSocket server own the HTTP server's `upgrade` event.**
   `new WebSocketServer({ server, path })` destroys every non-matching upgrade,
   including Next's dev HMR socket, which stops the client bootstrap so **React
   never hydrates and no button works**. Colyseus is on its own port precisely to
   avoid this. Symptom is "connection refused" plus a completely dead UI.
3. **No CDN assets.** `<Environment preset="city" />` fetches an HDR at runtime
   and, under one `Suspense`, blanks the whole scene. Lighting is plain lights.
   Name labels use drei `Html`, not `Text` (troika fetches a font).
4. **Nothing here deploys to Vercel.** Ignore Vercel-shaped advice; a LAN game
   should not round-trip the internet.
5. **Colyseus schema fields use `declare`, never `!`.** Node strips types by
   blanking characters, not re-emitting, so `x!: number` survives as the class
   field `x;` — an own property that shadows the accessor `defineTypes` installs.
   Every state encode then dies with `Cannot read properties of undefined
   (reading 'Symbol(Symbol.metadata)')` and the server falls over on the first
   join. See `src/game/server/CLAUDE.md`.

## Verifying changes

`npx tsc --noEmit` and `npx eslint .` are the fast gates; `npm run build` before
calling anything done.

**What the agent's browser can and cannot do.** The tab reports
`visibilityState: "hidden"`. Despite that, r3f *does* draw and screenshots come
back with the scene in them — so the arena, the figure, poses, paint and the HUD
can all genuinely be looked at. (An older note here claimed frames never render;
that was checked and is wrong.)

**Pointer lock is the real limit.** Chrome refuses `requestPointerLock()` while
the tab is hidden, so **anything gated on the seeker's lock cannot be driven from
here** — first-person look and, above all, shooting. A click on the canvas as a
seeker just re-requests the lock forever. Verify hider-side behaviour in the
browser and hand the seeker's trigger to the user.

Judgement calls are still the user's: figure proportions, camera feel, gun
placement, whether the layout plays well. Say plainly what was seen and what was
not, instead of implying it was all checked.

Networking is testable headlessly and should be: drive two `colyseus.js` clients
from a scratch `.mjs` script in the project root (so `node_modules` resolves)
against a running server, assert what each sees, then delete it.

## Not built yet

No round flow (hide phase, timer, win condition), no lobby or ready-up, no
health — a hit is instantly fatal — and no sound. Paint has no undo and no
per-part erase. Each folder's doc ends with the gaps specific to it.

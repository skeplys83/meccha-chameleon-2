# Meccha Chameleon

A multiplayer hide-and-seek game. Chameleons are stick figures who can lie on their
side to pass as scenery; hunters hunt them in first person with a shotgun. No
accounts, no third-party services.

It runs two ways, and both matter. **On a LAN**, every machine runs the whole app
and UDP discovery lists the machines on the Wi-Fi. **On a single hosted server**,
one container serves everybody and discovery is switched off — see "Hosting it"
in the README. It is **not deployed to a serverless platform**: the game is one
long-lived process holding websocket rooms, which is the opposite of what those
platforms do.

**One server runs many games at once.** A player opens a **lobby** — the arena,
playable, with a four-letter invite code and a size between 2 and 12 chosen when
it was created — and a round begins on a **ten-second countdown**, started either
by the lobby filling up or by the host pressing Start.

**A round has four phases and the map decides how long it is** (two minutes for
the dungeon, hiding included):

1. **countdown**, 10s, in the lobby. At zero the server draws one player at
   random to be the **hunter**; everyone else becomes a **chameleon**.
2. **hiding**, 20s. The chameleons are moved to the map. **The hunter is not** —
   they stay in the lobby, playing the arena alone, so they cannot watch anybody
   choose a spot.
3. **hunt**, the rest of the round. The bell rings, the hunter is brought in.
   **Being caught does not put you out**: you become a hunter yourself, at the
   spawn point, stripped back to white, and you join the hunt. So the hunt grows
   and the last chameleon is hardest to catch.
4. **reveal**, 30s. Whoever is left standing is where they hid, and every grave
   marks where somebody was found. **Everyone still walks** — the round is
   decided but the world is not frozen, so you can go and look at the spot that
   beat you. Nobody can be caught: `kill` is refused outside the hunt. Then
   everyone goes back to the lobby and can start another.

**Chameleons win** if the clock runs out with one of them still free;
**hunters win** if the last one is caught. Both rooms are the same class under
two registered names; the lobby stays behind precisely so there is somewhere to
come back to — and so the hunter has somewhere to wait.

Two things follow and are load-bearing. **A code is the only way *in*, and
listing only decides whether you can *find* it**: a lobby is public by default
and appears in the menu with the number of players across both its rooms, but
unticking that box hides it without locking it — the code works the same either
way. **Nobody
picks a side**: everyone waits as a *hunter*, the draw at the end of the
countdown leaves one of them armed and turns the rest into chameleons, and a role
sent from a client is honoured only in a match *and* only when it carries the
pass the lobby minted — which is what stops a chameleon rejoining a match as the
hunter. A `kill` is refused in a lobby and outside the hunt phase, since everyone
in a lobby is armed and the reveal is a look at where the round ended rather than
extra time.

**The host is whoever has been in the game longest**, so it is the creator until
they leave, and then the next-longest. It survives the round trip because each
tab sends a `sessionStorage` player id that is forwarded through both seat
reservations — session ids are per room and change every time you cross one.

**A dropped socket is not a departure.** A match holds your seat for twenty
seconds — your body stays standing there, and stays catchable — so reconnecting
returns you to the same side and position. The client tells you it
happened rather than leaving you in a game that has quietly stopped listening. There are no accounts and nothing is
persisted: a player is a name typed into a box. See
`src/game/server/CLAUDE.md` for the matchmaking and `src/game/net/CLAUDE.md` for
the client's side of the move.

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

Anything not inside a documented folder — `Game.tsx`, `Scene.tsx`, `index.html`,
`src/main.tsx`, `src/index.css` — is covered by this file.

## Run it

```bash
npm run dev     # node src/game/server/index.ts — page on :3000, Colyseus on :2567
npm run build   # vite build -> dist/
npm start       # same server, NODE_ENV=production, serving dist/
```

**The server is TypeScript with no build step.** Node 22.18+ / 23.6+ strips the
types itself, so `node src/game/server/index.ts` just runs. `"type": "module"` in
package.json is what stops Node reparsing it as CommonJS first. `vite build`
builds the *client* only.

`npm run dev` does **not** run `vite`. It runs the custom server, which creates
Vite in **middleware mode** and mounts it as the fall-through behind
`/api/sessions` and `/monitor` — so there is one port, one process, and the LAN
URL the banner prints is the only one anybody needs. The banner also prints the
Colyseus port and, in development, the HMR port.

**Vite's HMR websocket gets a port of its own** (`HMR_PORT`, default 24678), for
exactly the reason Colyseus has one — see trap 2. `server.allowedHosts: true` in
the middleware config is what lets a guest open the LAN URL; Vite checks the Host
header and refuses names it does not recognise, which would otherwise be a dead
page for everybody who is not the developer. It replaces Next's
`allowedDevOrigins`, and it is one line rather than a startup scan of the
machine's addresses because Vite checks the *host* once rather than the origin of
every asset request.

Useful env vars: `PORT` (web, default 3000), `GAME_PORT` (Colyseus, default 2567),
`HMR_PORT` (Vite's dev socket, default 24678), `PUBLIC_GAME_PORT` (what clients
are *told* to connect to, when a proxy fronts Colyseus), `LAN_DISCOVERY=0` (skip
UDP broadcast on a hosted box), `SESSION_NAME`, `MONITOR_PASSWORD` /
`MONITOR_USER` / `MONITOR=0` (the admin panel — see "Watching it run" in the
README).

**The admin panel is at `/monitor`** and is the only way to see the matchmaking
from outside: a lobby and its match are two rooms, and a player only ever sees
the one they are standing in. It is on in development and, because it can end any
room, absent in production unless `MONITOR_PASSWORD` is set.

`Dockerfile` and `docker-compose.yml` are the hosted path. The image is Node 22
because the server is TypeScript that Node strips at load — there is no build
step for it, and an older Node fails to parse rather than misbehaving. The
runtime stage carries `dist/` and `src/` and installs `--omit=dev`, which works
because the production server never touches Vite: the import is
`await import("vite")` *inside* the development branch, not a top-level one.

## Stack

- Vite 8 + React 19, TypeScript, Tailwind v4
- three.js + `@react-three/fiber` + `@react-three/drei`
- `@react-three/rapier` for physics
- **Colyseus 0.16** server + `colyseus.js` 0.16 client, `@colyseus/schema` v3
- `@colyseus/monitor` 0.16 + `express`, for the admin panel at `/colyseus`

### Version constraint — do not "upgrade" Colyseus casually

`colyseus@latest` is 0.17 (schema v4) but the browser client `colyseus.js` only
goes up to 0.16 (schema v3). Mixing them is a protocol mismatch and npm refuses
to resolve it. The whole stack is deliberately pinned to the 0.16 / schema-3
line. Bump all three together or not at all.

**`@colyseus/monitor` is pinned to 0.16 for a sharper reason.** Its 0.17 line
depends on `@colyseus/core@^0.17`, which npm installs *alongside* our 0.16 rather
than refusing — giving a second matchMaker in the same process that knows about
none of our rooms. The panel loads and lists nothing, with no error to explain
it. Four things move together now, not three.

## The map

```
index.html          the page shell: title, viewport, favicon link, #root
src/main.tsx        createRoot(...).render(<Game />) — no StrictMode, see trap 1
src/index.css       the one stylesheet: @import "tailwindcss" and four tokens
dist/               `vite build` output. Generated, gitignored, never edited
src/game/
  Game.tsx          top-level state: joined, session, room, paused, painting, killed
  Scene.tsx         Canvas, lights, Physics, mark and grave lifetimes
public/sounds/      the five .wav files
public/maps/        model assets for maps that use them
public/icon.svg     the favicon — generated, see below
scripts/            check-docs.mjs, check-constants.mjs, make-favicon.mjs
```

**`public/` is the source, `dist/` is the build — they are *meant* to hold the
same assets.** Vite copies `public/` into `dist/` verbatim at build time, so
after `npm run build` the sounds and the dungeon models exist in both. That is
not duplication to clean up: `public/` is committed and edited, `dist/` is
generated, gitignored, and wiped on every build (`emptyOutDir`, on by default —
a file deleted from `public/` cannot linger in `dist/`). In development Vite
serves `public/` directly and `dist/` is not consulted at all; in production the
server serves `dist/` and never looks at `public/`. Either way the URLs are the
same, which is why `sound/catalogue.ts` can say `/sounds/step.wav` and be right
in both.

**Those three asset kinds stay in `public/` rather than being imported through
the bundler**, and the glTF is the reason the rule is worth writing down: a
`.gltf` references its `.bin` and its texture by relative path, and importing one
as a module leaves those two references pointing nowhere. Sounds and the favicon
could go either way; they sit beside the models for consistency and because
neither benefits from fingerprinting.

**The favicon is generated, not drawn.** `npm run favicon` paints a chameleon's head
— a shaded sphere with a few random brush drags — and writes `public/icon.svg`.
It reads the real `PAINT` table from `paint/palette.ts`, so the icon can never
drift from the game's palette, and it projects each dot onto the sphere (squashed
along the radial direction by its angle from the viewer) so the paint sits on a
ball rather than on a sticker. Every run prints its seed; re-roll until you like
one, then pin it with `npm run favicon <seed>`. The committed one is seed 33.
It lives in `public/`, so `vite build` copies it verbatim; the single
`<link rel="icon">` in `index.html` is the only wiring, and there is no
`favicon.ico`.

| folder     | owns                                                    | read it before touching                       |
| ---------- | ------------------------------------------------------- | --------------------------------------------- |
| `shared/`  | `Role` and the constants both halves must agree on      | anything the server also reads                |
| `server/`  | Colyseus rooms, matchmaking, schema, UDP, HTTP          | messages, validation, authority, lobbies      |
| `net/`     | the Colyseus **client**, remotes, which room you are in | joining, moving rooms, remote transforms      |
| `world/`   | the maps, and the registry that picks one               | room layout, collision, cover, adding a map   |
| `figure/`  | the stick figure rig, the poses, `PART_SHAPE`           | proportions, poses, limb geometry             |
| `paint/`   | canvases, brush, palette, the panel                     | painting, brushes, skins, colours             |
| `players/` | the local player and the remote ones, `BODY`            | controls, camera, movement, jumping, climbing |
| `combat/`  | the shotgun, the viewmodel, marks, graves               | shooting, death, hit feedback                 |
| `sound/`   | the audio engine, the catalogue, footsteps              | anything that makes a noise                   |
| `hud/`     | the 2D overlays outside the Canvas                      | menus, legends, name entry                    |

`Game.tsx` and `Scene.tsx` are the composition roots and belong to no folder.
`Scene.tsx` also owns the `<Physics>` and `<Canvas>` settings — see trap 4 for
why the timestep is not the library default, and note that `shadows` is spelled
`"percentage"` rather than left bare, because three has deprecated the
`PCFSoftShadowMap` that a bare `shadows` selects and downgrades it to exactly
this anyway.

**A change of room is a clean slate, and there is exactly one place that says
so.** `net/` fires `onLeftRoom` at each of the three moments a room ends — a
hand-off, a deliberate exit, a dead socket — always *before* the next room is
attached, so a listener can clear without racing the backlog the new room is
about to replay. Pressing Start opens a match with nobody painted, no shot marks
and no graves; when the round ends the lobby comes back the same way. Paint used
to be the exception and was carried across deliberately; it no longer is.

**The rule for anything added later: if it belongs to a room, it resets on
`onLeftRoom`.** Today that is paint and looping sounds (`Game.tsx`), marks and
graves (`Scene.tsx`) and the remote players (`net/client.ts`, beside the event).
The local body is the one thing that is *rebuilt* rather than cleared — see
below. Do not add a second mechanism; a reset that lives anywhere else is one a
future feature will not know to join.

**Crossing between rooms rebuilds the local player.** `Scene.tsx` keys
`<Player>` on the room's code, so a lobby → match → lobby round trip constructs a
new one each way. Everything about a player that is *not* on the wire lives
inside that component — position, pose, camera yaw/pitch/zoom, cling, vertical
velocity, and the footstep `Stepper` built from whichever role it mounted with —
and none of it is true of the room you have just been carried into — you arrive
at that map's own `spawn` point, upright and facing forward. Without the
key you land back in the waiting room standing wherever the clock caught you,
still lying on your side if that is how you were hiding, and still walking with
the stride of the side you are no longer on. Paint is the deliberate exception:
it is module state in `paint/skin.ts` and `net/` re-sends it on arrival, because
painting yourself is most of what a waiting room is for. Marks and graves belong
to their room too and are dropped on `onLeftRoom` — see `net/CLAUDE.md`.

**`Game.tsx` holds two kinds of state and they do not change at the same time.**
Local state (`joined`, `paused`, `killedBy`) flips the instant a button is
clicked; room state (`room`, and the `role`, `map` and `mode` read off it)
arrives when the connection settles, a few hundred milliseconds later. Anything
that renders the world must be keyed on the *room*, never on `joined` — keying
the player on `joined` fell back to `"chameleon"` for that window and spawned you
into the waiting room as a small third-person figure before snapping to the
hunter's first-person camera. `enter` clears `room` on the way in for the same
reason: the room being left says nothing true about the one being opened.

Every mode transition in the game is decided in `Game.tsx` — which also means it
owns the *teardown* of each: joining unlocks audio, pausing suspends it, and
dying or leaving stops every looping sound. It owns the hunter's pointer lock the
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

The folder docs hold the rest. These eight are project-wide:

1. **Never wrap the tree in `<StrictMode>`.** R3F's `Canvas` does not survive
   StrictMode's dev-only double mount: the discarded mount calls
   `forceContextLoss()` and the canvas stays dead. Symptom is a black screen and
   `THREE.WebGLRenderer: Context Lost.` This used to be spelled
   `reactStrictMode: false` in `next.config.ts`; it now lives as the *absence* of
   a wrapper in `src/main.tsx`, which is easier to reintroduce by accident —
   every React starter template has one.
2. **Never let a WebSocket server own the HTTP server's `upgrade` event.**
   `new WebSocketServer({ server, path })` destroys every non-matching upgrade,
   including the dev HMR socket, which stops the client bootstrap so **nothing
   mounts and no button works**. Both Colyseus and Vite's HMR are on their own
   ports precisely to avoid this — `server.hmr.server` would hand Vite this one.
   Symptom is "connection refused" plus a completely dead UI.
3. **No CDN assets, at runtime *or* at build time.** `<Environment preset="city" />`
   fetches an HDR at runtime and, under one `Suspense`, blanks the whole scene.
   Lighting is plain lights. Name labels use drei `Html`, not `Text` (troika
   fetches a font). This is a LAN game; there may be no internet at all — which
   is also why the Geist webfonts went with Next: `next/font/google` downloaded
   them during `npm run build`, so the build itself needed the internet. The HUD
   is `font-mono` throughout and now resolves to Tailwind's system stack. To put
   a real font back, commit the files under `public/` and `@font-face` them.
4. **`<Physics timeStep="vary">` in `Scene.tsx` is load-bearing, and more so
   now.** On the default fixed 1/60 step, @react-three/rapier renders every body
   at an *interpolated* transform each frame while `rb.translation()` — which the
   camera and every raycast in `players/Player.tsx` read — only changes on a
   step. Two clocks, drifting apart by up to one step, which shows as the figure
   jittering against the camera at one-frame intervals. Stepping once per
   rendered frame makes the interpolation alpha 1 and the two always agree. The
   player is now a *kinematic* body driven by one
   `setNextKinematicTranslation` per frame, so a fixed step would also mean
   frames that compute a new target and then do not move — the same stutter,
   arrived at from the other direction.
5. **Never call into rapier from a React effect — only from `useFrame`, and
   never cache a rapier handle across a world reset.** This is why
   `players/controller.ts` builds the character controller lazily on first frame
   rather than in a mount effect — *and* why it re-checks the cached one against
   `world.characterControllers` before reusing it. `useRapier().world` is a
   **singleton proxy**: a stable JS object whose inner world @react-three/rapier
   can free and rebuild, so a `WeakMap` keyed on it happily survives the reset
   and hands back a controller belonging to a world that is gone. A handle
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
7. **Nothing here deploys to a serverless platform.** The game is one long-lived
   process holding websocket rooms in memory. Ignore advice shaped around
   request-scoped functions, and ignore the Vercel-shaped advice this repo used
   to attract by being a Next app — a LAN game should not round-trip the
   internet. The hosted path is the Dockerfile.
8. **No secure-context-only browser API.** `crypto.randomUUID`,
   `navigator.clipboard`, `crypto.subtle`, geolocation and the rest exist on
   `localhost` and over HTTPS and **nowhere else** — including
   `http://192.168.x.x:3000`, which is how every guest opens this game. The
   failure only ever hits the people who are not the developer, and it is not
   subtle: `crypto.randomUUID is not a function` killed every LAN join the day
   player ids were added. Use `crypto.getRandomValues`, which carries no such
   restriction; where there is no unrestricted equivalent, feature-detect and
   fall back (`LobbyPanel`'s Copy button falls back to `execCommand`, deprecated
   and therefore unrestricted). Testing on localhost cannot catch this.

## Verifying changes

```bash
npx tsc --noEmit && npx eslint . && npm run build
```

Those three are the gates; run `npm run build` before calling anything done.

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

## Not built yet

**No score across rounds.** A round has a winner and then the lobby forgets it —
nothing is tallied, and there are no accounts to tally it against. No ready-up: a
lobby is a place to wait, not a checklist. No health — a catch is instant. No
spectating, because being caught keeps you playing instead. One spawn point per
map, so a full lobby lands on the same square and walks apart. The whistle is a
periodic tell **chameleons** give off, not a round bell: it is heard from wherever
its owner is standing, and hunters never make one. Paint has no undo and no
per-part erase. Each folder's doc ends with the gaps specific to it.

# Ignore these links
https://kenney.nl/assets/category:3D
https://kaylousberg.itch.io/kaykit-dungeon-pack
https://freesound.org/people/Seth_Makes_Sounds/sounds/680134/
https://freesound.org/people/NHumphrey/sounds/204466/
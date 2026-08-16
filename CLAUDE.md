# Super Chameleon

A multiplayer hide-and-seek game. Chameleons are stick figures who can lie on their
side to pass as scenery; hunters hunt them in first person with a shotgun. No
accounts, no third-party services.

A central server serves all players via web and WebSocket connections.
It is **not deployed to a serverless platform**: the game is one
long-lived process holding websocket rooms, which is the opposite of what those
platforms do.

**One server runs many games at once.** A player opens a **lobby** — the arena,
playable, with a four-letter invite code and a size between 2 and 12 chosen when
it was created — and a round begins on a **ten-second countdown**, started either
by the lobby filling up or by the host pressing Start.

**A round has four phases and the map decides how long it is** (five minutes for
the dungeon, hiding included):

1. **countdown**, 10s, in the lobby. At zero the server draws one player at
   random to be the **hunter**; everyone else becomes a **chameleon**. **The
   lobby is closed for the duration** — a stranger with the code is turned away
   until the round is over, because the draw is over whoever is present at zero
   and because a latecomer has no time to load the map they are about to be moved
   to. Anyone this game already knows still gets in, so a blink inside the ten
   seconds is not an ejection.
2. **hiding**, 20s. The chameleons are moved to the map. **The hunter is not** —
   they stay in the lobby, playing the arena alone, so they cannot watch anybody
   choose a spot.
3. **hunt**, the rest of the round. The bell rings, the hunter is brought in.
   **Being caught does not put you out**: you become a hunter yourself, at the
   spawn point, stripped back to white, and you join the hunt. So the hunt grows
   and the last chameleon is hardest to catch.
4. **reveal**, 30s. The survivors pulse red through the walls, standing exactly
   where they hid, and every grave marks where somebody was found. **The
   survivors are rooted** — they are the exhibit, and a spot they walk away from
   is not a spot — but they keep their camera, and everyone else walks over to
   look at the thing that beat them. Nobody can be caught: `kill` is refused outside the hunt. Then
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

**Every folder documents itself.** Each folder under `src/game/` has its own
`CLAUDE.md` holding that folder's invariants — the rule with the bug it prevents
attached — and its contracts with the folders around it. This file is the
orientation: what the game is, what it is built from, and where everything lives.

**The prose lives in these docs, and the code stays thin.** It did not use to:
38% of `src/` was comment, most of it the same invariants written out a second
time next to the code they governed, which is expensive for every agent that
reads the file and drifts from the doc the moment either changes. The rule now:

- **A code comment is at most a few lines**, and says what is not visible from
  the line it sits on — a citation (`see trap 4`), a unit, a non-obvious
  ordering. Nothing over four lines survived the pass that established this, and
  a new one over four lines is a sign the fact belongs in the folder's doc.
- **A rule with a bug attached goes in the folder's `CLAUDE.md`**, once. That is
  what those files are for and they are already thorough; anything the strip
  removed is either in them, in `docs/TRAPS.md`, or in git.
- The pre-commit hook already forces you to open the doc for any folder you
  touch, which is the mechanism that keeps this from rotting.

The rest of the project-wide prose is split out, because it is reference rather
than orientation and this file was becoming a thing nobody finishes:

|                                        |                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/TRAPS.md](docs/TRAPS.md)         | eight project-wide traps, each one a debugging session already paid for. **Numbered, and referenced by number from code all over the repo.** |
| [docs/RUNNING.md](docs/RUNNING.md)     | the scripts, the ports, the env vars, and how `public/` and `dist/` relate                                                                   |
| [docs/VERIFYING.md](docs/VERIFYING.md) | the gates, and what can and cannot be checked without a browser                                                                              |

**Read the doc for the folder you are about to edit, and update it in the same
change.** The pre-commit hook enforces the second half: staging code without
staging the `CLAUDE.md` that covers it fails the commit. It also runs
`scripts/check-constants.mjs`, which fails if a `shared/protocol.ts` constant is
*defined* a second time anywhere — the one class of bug this layout exists to
prevent, and one I have already reintroduced once. Maps are **not** checked by
a hook — the Blender workflow is deliberately outside this repo, and the one
thing that could rot (the numbers in `world/maps.ts` against the `.glb` beside
them) is checked in the browser at load instead. Enable
the hook once per clone with `git config core.hooksPath .githooks`; run the doc
half any time with `npm run check:docs`. The escape hatch for a genuine no-op is
`SKIP_DOC_CHECK=1 git commit`.

Anything not inside a documented folder — `Game.tsx`, `Scene.tsx`, `loading.ts`,
`dev.ts`, `index.html`, `src/main.tsx`, `src/index.css` — is covered by this file. **The composition
roots stay here deliberately**: this is the only doc loaded into a session
automatically, so what an agent needs without being told to go looking for it
belongs in it.

**Hosted deployments can run on a single exposed port.** In production (and in
Docker), Colyseus attaches directly to the HTTP server on `PORT` (default 3000)
unless `GAME_PORT` is explicitly set to a different port. When behind a TLS
reverse proxy, the proxy terminates HTTPS on 443 and fronts the web and socket
traffic, and `PUBLIC_GAME_PORT` informs clients to connect over port 443. The
compose service also pins Docker log rotation (`max-size` 10 MB, `max-file` 3)
so repeated deploys do not fill a small VPS disk through `json-file` logs alone.

**A join must never dereference a missing target.** The menu can render while the
session list is empty or stale; a lobby button still tries to call through the
same flow, and the correct behaviour is to stop with a normal error before a join
reaches the socket layer. The browser is allowed to say "no game server selected"
— it is not allowed to crash on `undefined.name` while it is still building the
error message.

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
it. **Four things move together**, and the check after any bump is
`find node_modules -type d -name core -path "*@colyseus*"` — expect exactly one
line.

## The map

```
index.html          the page shell: title, viewport, favicon link, #root
src/main.tsx        createRoot(...).render(<Game />) — no StrictMode, see trap 1
src/index.css       the one stylesheet: @import "tailwindcss" and four tokens
dist/               `vite build` output. Generated, gitignored, never edited
src/game/
  Game.tsx          top-level state: joined, session, room, paused, painting, killed
  Scene.tsx         Canvas, Physics, mark and grave lifetimes
  crazygames.ts     CrazyGames SDK v3 integration: instant multiplayer, invite links, room reporting
  loading.ts        one counter: is the player waiting on something to arrive
  dev.ts            developer mode: the flag, and the player snapshot it shows
public/sounds/      the nine .mp3 files
public/maps/        one .glb per map — the only map asset the game loads
public/models/      player.glb — the one rigged body everyone wears
characters/         figure-poses.blend: two collections, `export` (the rigged,
                    unwrapped body exported to public/models/player.glb) and
                    `reference` (the eight sculpted poses the angles were
                    fitted to). Source and reference; nothing under src/ reads it
levels/             the .blend files those are exported from, and the raw kit.
                    The real source; nothing under src/ reads any of it.
                    AUTHORING.md there is the map-building guide: shells,
                    props, collision, and the checks that prove a map is sound
Dockerfile          the single-port production container build
scripts/            check-docs.mjs, check-constants.mjs, make-favicon.mjs,
                    export-level.sh + export-level.py (Blender → public/maps/)
```

| folder     | owns                                                    | read it before touching                       |
| ---------- | ------------------------------------------------------- | --------------------------------------------- |
| `shared/`  | `Role` and the constants both halves must agree on      | anything the server also reads                |
| `server/`  | Colyseus rooms, matchmaking, schema, HTTP               | messages, validation, authority, lobbies      |
| `net/`     | the Colyseus **client**, remotes, which room you are in | joining, moving rooms, remote transforms      |
| `world/`   | the maps, and the registry that picks one               | room layout, collision, cover, editing a map  |
| `figure/`  | the stick figure rig, the poses, `PART_SHAPE`           | proportions, poses, limb geometry             |
| `paint/`   | canvases, brush, palette, the panel                     | painting, brushes, skins, colours             |
| `players/` | the local player and the remote ones, `BODY`            | controls, camera, movement, jumping, climbing |
| `combat/`  | the shotgun, the viewmodel, marks, graves               | shooting, death, hit feedback                 |
| `sound/`   | the audio engine, the catalogue, footsteps              | anything that makes a noise                   |
| `hud/`     | the 2D overlays outside the Canvas                      | menus, legends, name entry                    |

**Every map is one `.glb` exported from Blender, and the repo has no part in
making one.** `levels/<id>.blend` is the map, `public/maps/<id>.glb` is its
export, and the row in `world/maps.ts` is a display name plus the few numbers the
game needs before the file has loaded. There is **no build step and no generated
file** — nothing in `src/` or `scripts/` reads, writes or validates a `.blend`,
and adding something that does would put the two workflows back together. The
one wrapper that knows how to turn a `.blend` into a `.glb` is
`scripts/export-level.sh`, and the game itself never runs it. The
conventions the `.glb` is read by — `col_*`, `colhull_*`, `coltri_*` and
`colball_*` for collision, everything else decoration — are in
`src/game/world/CLAUDE.md` under "Editing a map in Blender". The cost of having
no build step is that `spawn` and `bound` are typed by hand; `checkLevel` warns
in the console when they stop matching the file.

`Scene.tsx` passes the round's phase down as three separate facts rather than
one — `reveal` (light the survivors), `hunting` (drop their name badges) and
`frozen` (root them where they stand) — because each is read by a different part
of the tree and collapsing them into "the phase" would make every consumer
re-derive the same conditions. **`Scene.tsx` also owns the frame priorities, which are the game's one ordering
guarantee**: `0` decides where things are, `1` copies a result of that (the
viewmodel and the audio listener, both off the camera), `2` draws, and `3` reads
the drawn frame back — which is only the eyedropper, sampling the pixel it just
rendered. Mount order is
not a substitute — components remount independently, so a callback that must run
after another has to say so with a priority. `Scene.tsx` also owns the
`<Physics>` and `<Canvas>` settings — including `debug`, which draws every
collider and is `SHOW_COLLISION` from `world/surface.ts`, the same switch that
lights up the raycast layer — see trap 4 for
why the timestep is not the library default, and note that `shadows` is spelled
`"percentage"` rather than left bare, because three has deprecated the
`PCFSoftShadowMap` that a bare `shadows` selects and downgrades it to exactly
this anyway.

**`Scene.tsx` no longer owns the lights or the background.** Both are facts about
the map rather than about the game, and a map exported from Blender carries its
own lighting rig — so they moved into `world/Room.tsx`, which renders the old
ambient-plus-sun pair for maps built from primitives and gets out of the way for
maps built from a file. A light added back here applies to every map at once and
washes out the one that was lit deliberately.

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

**`Game.tsx` also decides when everything heavy is downloaded, and nothing is
fetched on page load.** The Canvas is mounted behind the start menu, so anything
hung on a mount effect is paid for by everybody who merely opens the game — which
is what both of these were. There are now four triggers and no others:

| what                                                  | how big | fetched when                                                    |
| ----------------------------------------------------- | ------- | --------------------------------------------------------------- |
| the match's map (`world/preload.ts`, `preloadMap`)    | 722 KB  | arriving in a lobby, keyed on `nextMap`; again at the countdown |
| the music (`sound/engine.ts`, `preloadMusic`)         | 1.2 MB  | the same two moments — it is an asset of the round              |
| the other eight sounds (`preloadSounds`)              | 126 KB  | the join click, inside `unlockAudio`                            |
| the character (`figure/model.ts`, `preloadCharacter`) | 354 KB  | the join click, beside the sounds                               |

A lobby is the arena, which is 237 KB and arrives with the join, so the minute or
more people spend gathering and painting is free budget for the two big ones. The triggers belong
here because this is the file that knows what room you are in and what it is
about to play.

**The loading screen is `loading.ts`, and it counts only what is being waited
on.** Two things raise it, and `hud/LoadingScreen` covers the screen for as long
as either is up — an opaque full-screen spinner:

- **`enter` in `Game.tsx`, while a join is in flight.** `joined` flips on the
  click and `room` lands a few hundred milliseconds later; in between the menu is
  gone and the world is an arena nobody is in yet. It ends on the room *or* on
  the error, in a `finally`, so a refused join cannot leave the spinner up.
- **`world/Room.tsx`'s `Suspense` fallback, while the map you are standing in is
  still arriving.** Behind it is a world with no colliders, and the body is held
  still rather than falling through where the floor will be — the frame loop in
  `players/Player.tsx` returns early while its surface list is empty, which is
  invariant 14 there. The screen and the hold are two halves of one answer: the
  hold is what makes the wait *safe*, the screen is what makes it legible.

The two downloads in the table above never raise it: they are ahead of the player
rather than in front of them, and a spinner over a lobby you are happily walking
around in would undo the reason they are early. **So the common path shows the
spinner only for the join** — by the time Start is pressed the match's map
has usually been in cache for a minute, and a transition with nothing to wait
for correctly waits for nothing. A player who *does* have to wait is not
disadvantaged by it beyond the wait itself: they stand at the spawn point until
the map lands, which is where they would have been anyway.

**Developer mode is `DEV` in `dev.ts`, and *availability* is the environment
rather than a setting.** It is `import.meta.env.DEV`, which vite *substitutes* at build time —
so it is true under `npm run dev` (the server runs vite in middleware mode) and
compiled to the literal `false` by `vite build`, which is the only thing the
Dockerfile's build stage runs. Everything behind it is then dead code the bundler
drops: the debug overlay and its imports are absent from `dist/`, checked by
grepping it. Two things are on it today:

- **The collision layer**, in `Scene.tsx` (`<Physics debug>`) and
  `world/GltfLevel.tsx` (the green `ROOM_SURFACE` wireframes). This replaced
  `SHOW_COLLISION`, a hand-flipped constant that shipped as `true`.
- **`hud/DebugPanel`**, bottom left: fps, the local player's position, camera,
  ground and cling state, and every number of the pose they are holding.

**`DEV` decides whether any of it exists; the toggle decides whether it is
showing.** `dev.ts` holds a small subscribable flag beside the build one — on by
default, because a switch you have to find before you see anything is a switch
nobody finds. It flips from the **DEV chip** at the bottom left, which is part
of the readout and stays visible when the mode is off (a toggle that vanishes
when you use it is a trap), or from **backquote**, which no game control uses
and which is the only way in for a hunter, who holds the pointer lock and cannot
click anything. The green collision layer over every wall is exactly what you
want while hunting for a hole in a map and exactly what you do not want the rest
of the time; that is the whole reason the switch exists.

**`dev.ts` also owns the one channel between them.** The panel is DOM outside
the Canvas and may not import from `players/` (`hud/CLAUDE.md`, invariant 1), and
what it wants to show is written inside a frame loop, where React state would be
sixty re-renders a second. So `players/Player.tsx` writes a snapshot into
`dev.ts` and the panel samples it ten times a second. **Anything else worth
watching goes through that snapshot**, not through a new import and not through
props threaded down from `Game.tsx`. It is dropped on `onLeftRoom` with
everything else that belongs to a room.

**Do not make developer mode reachable in production** — not by an env var, not
by a query parameter, not by a key. The point of tying it to the build is that
there is no switch to find.

Every mode transition in the game is decided in `Game.tsx` — which also means it
owns the *teardown* of each: joining unlocks audio, pausing suspends it, and
dying or leaving stops every looping sound. It owns the hunter's pointer lock the
same way, held for as long as they are playing at all rather than re-taken by
each button that hands control back — **which is why Esc closes the pause menu
for a chameleon and not for a hunter.** A hunter's Esc never reaches the app at
all: the browser spends it releasing the lock, and `pointerlockchange` is what
raises their menu. Were it to reach the app, dismissing would ask for the lock
back in the keypress that just gave it up, which the browser refuses — leaving
them looking around with no lock and no way back. A chameleon never holds one,
so for them the key works both ways, gated on `document.hasFocus()` so a pause
that came from losing the window is dismissed by returning to it rather than by
a keystroke landing in the background.

**`paused` and `painting` are mutually exclusive, and every path has to keep
them that way.** Opening the palette clears the pause; Esc closes the palette
before it will pause; the hunter's lock handler refuses to pause while it is
open. Losing the window was once the exception — it set `paused` and left
`painting` alone, which hid the pause menu *and* the palette while the keys
stayed dead, so a chameleon came back to a game that ignored them until they
pressed Esc to shut an invisible palette and only then found something to
resume. Anything that outlives its player, or fails to come back with it, is a
bug that lands here.

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

https://cults3d.com/en/orders/164754001
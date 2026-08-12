# Meccha Chameleon

A multiplayer hide-and-seek game. Chameleons are stick figures who can lie on their
side to pass as scenery; hunters hunt them in first person with a shotgun. No
accounts, no third-party services.

It runs two ways, and both matter. **On one machine per player**, every machine
runs the whole app and UDP discovery lists the others on the same network. **On a single hosted server**,
one container serves everybody and discovery is switched off — see "Hosting it"
in the README. It is **not deployed to a serverless platform**: the game is one
long-lived process holding websocket rooms, which is the opposite of what those
platforms do.

**One server runs many games at once.** A player opens a **lobby** — the arena,
playable, with a four-letter invite code and a size between 2 and 12 chosen when
it was created — and a round begins on a **ten-second countdown**, started either
by the lobby filling up or by the host pressing Start.

**A round has four phases and the map decides how long it is** (five minutes for
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

The rest of the project-wide prose is split out, because it is reference rather
than orientation and this file was becoming a thing nobody finishes:

| | |
| --- | --- |
| [docs/TRAPS.md](docs/TRAPS.md) | eight project-wide traps, each one a debugging session already paid for. **Numbered, and referenced by number from code all over the repo.** |
| [docs/RUNNING.md](docs/RUNNING.md) | the scripts, the ports, the env vars, and how `public/` and `dist/` relate |
| [docs/VERIFYING.md](docs/VERIFYING.md) | the gates, and what can and cannot be checked without a browser |

**Read the doc for the folder you are about to edit, and update it in the same
change.** The pre-commit hook enforces the second half: staging code without
staging the `CLAUDE.md` that covers it fails the commit. It also runs
`scripts/check-constants.mjs`, which fails if a `shared/protocol.ts` constant is
*defined* a second time anywhere — the one class of bug this layout exists to
prevent, and one I have already reintroduced once. It also runs
`scripts/check-map-assets.mjs` (`npm run check:maps`), which fails if a model
committed under `public/maps/` is never placed by a map, or if a map places a
file that is not committed — the dungeon is meant to hold the whole KayKit pack,
and a missing file leaves the map suspended forever rather than erroring. Enable
the hook once per clone with `git config core.hooksPath .githooks`; run the doc
half any time with `npm run check:docs`. The escape hatch for a genuine no-op is
`SKIP_DOC_CHECK=1 git commit`.

Anything not inside a documented folder — `Game.tsx`, `Scene.tsx`, `index.html`,
`src/main.tsx`, `src/index.css` — is covered by this file. **The composition
roots stay here deliberately**: this is the only doc loaded into a session
automatically, so what an agent needs without being told to go looking for it
belongs in it.

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
  Scene.tsx         Canvas, lights, Physics, mark and grave lifetimes
public/sounds/      the five .wav files
public/maps/        model assets for maps that use them
public/icon.svg     the favicon — generated, see below
scripts/            check-docs.mjs, check-constants.mjs, check-map-assets.mjs,
                    make-favicon.mjs
```

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

`Scene.tsx` passes the round's phase down as three separate facts rather than
one — `reveal` (light the survivors), `hunting` (drop their name badges) and
`frozen` (root them where they stand) — because each is read by a different part
of the tree and collapsing them into "the phase" would make every consumer
re-derive the same conditions. `Scene.tsx` also owns the `<Physics>` and `<Canvas>` settings — see trap 4 for
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

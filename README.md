# Meccha Chameleon 2

<img width="1914" height="967" alt="image" src="https://github.com/user-attachments/assets/8c62910d-3f56-489e-93d8-7124af27c636" />


A LAN-only multiplayer hide-and-seek game. Hiders are stick figures who can lie
on their side to pass as scenery; seekers hunt them in first person with a
shotgun. No internet, no accounts — everything runs on machines on the same
Wi-Fi.

## Run it

```bash
npm install
npm run dev
```

This starts a custom server (`src/game/server/index.ts`, TypeScript run
directly by Node — no build step): Next.js on `:3000` and a Colyseus
game server on `:2567`. It prints a LAN URL — other players on the same Wi-Fi
open that.

Press **Create game** and you get a waiting room in the arena with a four-letter
code. Games are public by default and show up in everyone's menu with a player
count, or untick the box and hand the code out yourself — either way the code is
what gets you in. Everyone waits armed. When the host presses Start, the whole
room moves to the chosen map, one player keeps the shotgun and the rest become
hiders. A match runs for sixty seconds; when it ends everyone is back in the
waiting room and the host can start another. One server runs as many games at once as you like. A code is the only way
into a game — nothing is listed.

Env vars: `PORT` (web), `GAME_PORT` (Colyseus), `SESSION_NAME`.

## Controls

`WASD` to move, mouse to look, `Q`/`E` to turn the figure, `Space` to jump.
Click the canvas to lock the cursor, `Esc` to release.

You do not choose a side — the seeker is drawn at random when the match starts.

- **Seeker** — first person with a shotgun, left click to fire (pump-action, so
  there is a delay between shots). Everyone is one in the waiting room, and
  exactly one stays one per match. Nobody can be killed while waiting.
- **Hider** — third-person camera, `1`–`5` for poses, left-drag to paint
  yourself, and the only side that can climb.

If your connection drops mid-match the server holds your seat for twenty
seconds — reconnect inside that and you keep your side, your position and your
paint. Your body stays standing there in the meantime, and can be shot.

Hiders can climb: walk into a wall or an object and you go onto it. `W`/`S` run
up and down the face, `A`/`D` across it, and `Space` lets go. Climb high enough
and you wrap onto the ceiling.

Sound is positional: footsteps, gunshots and deaths come from where they happen,
and a hider's lighter footsteps are pitched above a seeker's. Climbing is silent.
Every 45 seconds you whistle, and anyone near enough hears roughly where you are.

## Stack

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, three.js via
`@react-three/fiber` / `drei` / `rapier`, and Colyseus 0.16 for netcode.

## Layout

The code is grouped by feature, and **each folder documents itself** in a
`CLAUDE.md` beside the code: what it owns, its invariants and the bug each one
prevents, and its contracts with the folders around it.

```
src/game/
  shared/   Role + the constants both halves must agree on
  server/   Colyseus rooms, matchmaking, schema, UDP     <- runs in Node
  net/ world/ figure/ paint/ players/ combat/          <- run in the browser
  sound/ hud/
public/sounds/   four .wav files, all peak-normalised to -1 dBFS
```

Start at [CLAUDE.md](CLAUDE.md) for the map and the project-wide traps, then read
the doc for the folder you are changing.

## Hosting it

```bash
docker compose up -d --build
```

Then open `http://localhost:3000` — or the machine's address from anywhere else —
and press **Create game**.

The image has been built and run: the page is served, a lobby is created, a
second client joins it by code, Start moves both into one match on the chosen
map, and no `typescript` or Tailwind is present at runtime.

Two ports are published, because the browser talks to both: the page comes from
`PORT` (3000) and the game socket connects straight to `GAME_PORT` (2567). Over
plain http on an IP that is all you need.

**With a domain and HTTPS it is not enough.** A page served over `https://`
cannot open a plain `ws://` socket, so 2567 needs TLS as well. Put a reverse
proxy in front, terminate TLS for both, and tell clients where the socket really
is:

| variable | what it does |
|---|---|
| `PORT` | web port, default 3000 |
| `GAME_PORT` | Colyseus port the server **listens** on, default 2567 |
| `PUBLIC_GAME_PORT` | Colyseus port clients are **told** to use — set this when a proxy fronts it |
| `LAN_DISCOVERY` | `0` turns off UDP broadcast; it finds nothing on a hosted box |
| `SESSION_NAME` | name the server reports for itself |
| `MONITOR_PASSWORD` | enables the admin panel in production, behind Basic auth |
| `MONITOR_USER` | username for that, default `admin` |
| `MONITOR` | `0` turns the panel off in development |

## Watching it run

Colyseus's admin panel is mounted at **`/colyseus`** — open
<http://localhost:3000/colyseus> while the server is running.

It lists every live room. This game makes two kinds, so the list is the clearest
picture of what the matchmaking is doing:

- rows named **`lobby`** are waiting rooms. Their `host`, `map` and `started`
  columns come from the same metadata the menu's game list reads, so a lobby with
  `started: true` has a match running that its players are in.
- rows named **`match`** are games in progress. They have no metadata and are
  never listed in the menu — you reach one by being moved into it.

Click a room to inspect it. You get its state live — every player, their
position, pose, role and paint strokes, plus `timeLeft` ticking down on a match —
and the connected clients. Watching a lobby and its match side by side is the
only way to see the hand-off from outside; a player only ever sees the room they
are standing in.

**It is not read-only.** The panel can call any method on any room, including
disposing it, so anyone who can reach it can end anybody's game. That is why:

- in development it is on with no password — only you can reach `localhost`. Set
  `MONITOR=0` to turn it off.
- in production it does not exist unless `MONITOR_PASSWORD` is set, and then it
  is behind HTTP Basic auth. Forgetting the password fails closed rather than
  exposing it; the startup banner says which happened.

Basic auth sends the password in near-cleartext, so on a hosted box only enable
it behind the same TLS proxy that fronts the rest.

## Working on it

```bash
npm run check:docs        # are the folder docs current with what's staged?
npm run check:constants   # is any shared constant defined twice?
npx tsc --noEmit
npx eslint .
npm run build
```

A pre-commit hook refuses a commit that changes a folder's code without touching
that folder's `CLAUDE.md` — the docs are the only thing a fresh contributor (or
coding agent) reads first, so they are gated rather than merely encouraged.
Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

## Status

Movement, roles, poses, painting, shooting, kills, positional sound, LAN
discovery, reconnection, and many simultaneous games — lobbies, invite codes,
sixty-second matches and the trip back to the lobby — all work. Health, a hide
phase, a win condition and ready-up are not built yet: a round has a length but
no result.

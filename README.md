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
open that. Sessions on the network are discovered automatically via UDP
broadcast and listed in the menu.

Env vars: `PORT` (web), `GAME_PORT` (Colyseus), `SESSION_NAME`.

## Controls

`WASD` to move, mouse to look, `Q`/`E` to turn the figure, `Space` to jump.
Click the canvas to lock the cursor, `Esc` to release.

- **Hider** — third-person camera, `1`–`5` for poses, left-drag to paint yourself.
- **Seeker** — first person with a shotgun, left click to fire (pump-action, so
  there is a delay between shots).

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
  server/   Colyseus room, schema, UDP LAN discovery   <- runs in Node
  net/ world/ figure/ paint/ players/ combat/          <- run in the browser
  sound/ hud/
public/sounds/   four .wav files, all peak-normalised to -1 dBFS
```

Start at [CLAUDE.md](CLAUDE.md) for the map and the project-wide traps, then read
the doc for the folder you are changing.

## Working on it

```bash
npm run check:docs   # are the folder docs current with what's staged?
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

Movement, roles, poses, painting, shooting, kills, positional sound and LAN
discovery all work. Health, round flow and a lobby are not built yet.

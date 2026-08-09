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

This starts a custom server (`server.mjs`): Next.js on `:3000` and a Colyseus
game server on `:2567`. It prints a LAN URL — other players on the same Wi-Fi
open that. Sessions on the network are discovered automatically via UDP
broadcast and listed in the menu.

Env vars: `PORT` (web), `GAME_PORT` (Colyseus), `SESSION_NAME`.

## Controls

`WASD` to move, mouse to look, `Q`/`E` to turn the figure, `Space` to jump.
Click the canvas to lock the cursor, `Esc` to release.

- **Hider** — third-person camera, `1` stands upright and `2` lies flat on your side.
- **Seeker** — first person with a shotgun, left click to fire.

## Stack

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, three.js via
`@react-three/fiber` / `drei` / `rapier`, and Colyseus 0.16 for netcode.

## Status

Movement, roles, lying flat, shooting marks and LAN discovery all work. Hit
registration, health, round flow and sound are not built yet.

See [CLAUDE.md](CLAUDE.md) for architecture notes and the traps worth knowing
before changing anything.

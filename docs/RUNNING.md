# Running it, and what it serves

```bash
npm run dev     # node src/server/index.ts — page on :3000, Colyseus on :2567
npm run build   # vite build -> dist/
npm start       # same server, NODE_ENV=production, serving dist/
```

**The server is TypeScript with no build step.** Node 22.18+ / 23.6+ strips the
types itself, so `node src/server/index.ts` just runs. `"type": "module"` in
package.json is what stops Node reparsing it as CommonJS first. `vite build`
builds the *client* only.

`npm run dev` does **not** run `vite`. It runs the custom server, which creates
Vite in **middleware mode** and mounts it as the fall-through behind
`/api/sessions` and `/monitor` — so there is one port, one process, and the
network URL the banner prints is the only one anybody needs. The banner also prints the
Colyseus port and, in development, the HMR port.

**Vite's HMR websocket gets a port of its own** (`HMR_PORT`, default 24678), for
exactly the reason Colyseus has one — see trap 2. `server.allowedHosts: true` in
the middleware config is what lets a guest open the network URL; Vite checks the Host
header and refuses names it does not recognise, which would otherwise be a dead
page for everybody who is not the developer. It replaces Next's
`allowedDevOrigins`, and it is one line rather than a startup scan of the
machine's addresses because Vite checks the *host* once rather than the origin of
every asset request.

Useful env vars: `PORT` (web, default 3000), `GAME_PORT` (Colyseus, default 2567 in dev, defaults to `PORT` in production for single-port hosting),
`HMR_PORT` (Vite's dev socket, default 24678), `PUBLIC_GAME_PORT` (what clients
are *told* to connect to, when a proxy fronts Colyseus), `SESSION_NAME`,
`MONITOR_PASSWORD` / `MONITOR_USER` / `MONITOR=0` (the admin panel — see
"Watching it run" in the README).

**The admin panel is at `/monitor`** and is the only way to see the matchmaking
from outside: a lobby and its match are two rooms, and a player only ever sees
the one they are standing in. It is on in development and, because it can end any
room, absent in production unless `MONITOR_PASSWORD` is set.

`Dockerfile` and `docker-compose.yml` are the hosted path — the VPS builds the image itself, and `npm run release` is what makes a deploy happen (see [DEPLOYMENT.md](DEPLOYMENT.md) for Portainer & Cloudflare Tunnel details). The image is Node 22
because the server is TypeScript that Node strips at load — there is no build
step for it, and an older Node fails to parse rather than misbehaving. The
runtime stage carries `dist/` and `src/` and installs `--omit=dev`, which works
because the production server never touches Vite: the import is
`await import("vite")` *inside* the development branch, not a top-level one.

## Assets

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

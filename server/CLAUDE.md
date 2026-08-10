# server — the authoritative half

**Owns:** the Colyseus room and its state, LAN discovery over UDP, and the HTTP
bootstrap that serves Next.

**Entry point:** `node server/index.mjs`, which is what both `npm run dev` and
`npm start` run. There is no `next dev` in this project.

## Files

- `index.mjs` — starts discovery, prepares Next, serves `/api/sessions` itself
  and hands everything else to Next, starts Colyseus, prints the banner.
- `room.mjs` — `GameRoom`: every message handler, the clamping, the kill rules.
- `schema.mjs` — `Player` and `GameState`, the synced state.
- `discovery.mjs` — the UDP socket, the peer table, the session name.

The client half of all this is `src/game/net/` — see its doc for the receiving
end of every message named here.

## Invariants

1. **Two servers, never one.** Next keeps its own HTTP server, Colyseus listens
   on its own port. Handing a WebSocket server the HTTP server's `upgrade` event
   (`new WebSocketServer({ server, path })`) destroys every non-matching upgrade,
   including Next's dev HMR socket — which stops the client bootstrap, so **React
   never hydrates and no button on the page works**. The symptom is "connection
   refused" plus a completely dead UI. This is why the game is on `GAME_PORT`.
2. **State is what a late joiner still has to see.** Paint strokes and graves are
   permanent, so they are schema fields and arrive via `onAdd` backlog. Shot
   marks expire after three seconds, so they are a `broadcast` and are never
   stored. Getting this backwards means either a blank body on join or a room
   full of ghost marks.
3. **Movement is trusted, kills are not.** Clients simulate themselves and report
   their position; the server only clamps it into the arena. A kill is checked —
   caller must be a seeker, victim must exist and not be the caller — because it
   is the one message where a wrong client changes someone else's game.
4. **The victim is told before they are dropped.** `killed` is broadcast, then
   the victim is deleted from state, then `leave()` fires 250 ms later. Without
   the delay they disconnect before the message lands and see nothing but a
   dropped connection.
5. **Non-finite input becomes 0, never `NaN`.** That is what `clamp` is for. A
   `NaN` written into schema propagates to every client.

## Contracts

- **Reads `src/shared/protocol.mjs`** for `ROOM_LIMIT`, `POSE_COUNT`,
  `MAX_STROKES`, `MAX_STROKE_LENGTH`. Do not re-declare any of them here.
- **Messages in** (`room.mjs` ← `net/send.ts`): `state`, `paint`, `clearSkin`,
  `shoot`, `kill`.
- **Messages out** (→ `net/client.ts`): `mark` to everyone; `paint` and
  `clearSkin` to everyone *except the sender*, who already drew it locally;
  `killed` to everyone.
- **`/api/sessions`** returns `{self, sessions}` and is consumed by
  `net/sessions.ts`. The browser rewrites `self.host` to `location.hostname`,
  because a server does not know which of its addresses you reached it by.
- **Discovery is best-effort.** A failed UDP bind logs a warning and the game
  runs on regardless — you just have to type the host's address yourself.

## Not built yet

No round flow (hide phase, timer, win condition), no lobby or ready-up, no
health — a hit is instantly fatal. `reconnection` is unused: a dropped player
is simply gone, and a respawn is a fresh join.

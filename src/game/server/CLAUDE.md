# server — the authoritative half

**Owns:** the Colyseus room and its state, LAN discovery over UDP, and the HTTP
bootstrap that serves Next.

**Entry point:** `node src/game/server/index.ts`, which is what both `npm run
dev` and `npm start` run. There is no `next dev` in this project, and no build
step for the server — **Node strips the TypeScript itself** (22.18+ / 23.6+).

It lives under `src/game/` with the client, but it is a *different runtime*: this
code never reaches the browser, and nothing here may import from `world/`,
`figure/`, `paint/`, `players/`, `combat/` or `hud/`. The only shared ground is
`../shared/protocol.ts`.

## Files

- `index.ts` — starts discovery, prepares Next, serves `/api/sessions` itself and
  hands everything else to Next, starts Colyseus, prints the banner.
- `room.ts` — `GameRoom`: every message handler, the clamping, the kill rules.
- `schema.ts` — `Player` and `GameState`, the synced state.
- `discovery.ts` — the UDP socket, the peer table, the session name.

The client half is `game/net/` — see its doc for the receiving end of every
message named here.

## Invariants

1. **Schema fields use `declare`, never `!`.** This is the one that will bite
   you. Node strips types by *blanking the characters out*, not by re-emitting,
   so `name!: string` survives as the class field `name;` — which defines an own
   property that shadows the accessor `defineTypes` installs on the prototype.
   Colyseus then cannot find its metadata and every state encode dies with
   `TypeError: Cannot read properties of undefined (reading
   'Symbol(Symbol.metadata)')`, taking the process down on the first join.
   `declare name: string` is erased completely, which is what these need to be.
   The same reasoning forbids field initialisers — `strokes` is assigned in the
   constructor.
2. **Type stripping is stripping, not compiling.** No `enum`, no `namespace`, no
   parameter properties, and **no decorators** — which is why the schema uses
   `defineTypes(...)` rather than `@type`. Imports must name the real file
   (`./room.ts`), which is what `allowImportingTsExtensions` in tsconfig permits.
3. **Two servers, never one.** Next keeps its own HTTP server, Colyseus listens
   on its own port. Handing a WebSocket server the HTTP server's `upgrade` event
   destroys every non-matching upgrade, including Next's dev HMR socket — which
   stops the client bootstrap, so **React never hydrates and no button on the
   page works**. The symptom is "connection refused" plus a completely dead UI.
4. **State is what a late joiner still has to see.** Paint strokes and graves are
   permanent, so they are schema fields and arrive via `onAdd` backlog. Shot
   marks expire after three seconds, so they are a `broadcast` and are never
   stored. Getting this backwards means either a blank body on join or a room
   full of ghost marks.
5. **Movement is trusted, kills are not.** Clients simulate themselves and report
   their position; the server only clamps it into the arena. A kill is checked —
   caller must be a seeker, victim must exist and not be the caller — because it
   is the one message where a wrong client changes someone else's game.
6. **The victim is told before they are dropped.** `killed` is broadcast, then the
   victim is deleted from state, then `leave()` fires 250 ms later. Without the
   delay they disconnect before the message lands and see nothing but a dropped
   connection.
7. **A schema `boolean` must be coerced, not assigned.** `player.cling =
   msg.cling === true`, never `= msg.cling`: the encoder will happily take a
   string or an object and hand it to every client. The same instinct as `clamp`
   for numbers.
8. **Non-finite input becomes 0, never `NaN`.** That is what `clamp` is for. A
   `NaN` written into schema propagates to every client.
9. **A whistle is relayed, never stored, and rate-limited like a shot.** It only
   gives a position away, so it is trusted the way movement is — but *rate*
   reaches everybody, so `MIN_WHISTLE_GAP_MS` stops a client turning theirs into
   a siren. A player who has left the room cannot whistle at all.
10. **One trigger, one clock.** `canFire` rate-limits `shoot` and `kill` together,
   per client, because a trigger-pull sends exactly one of the two — never both.
   The gap is `FIRE_INTERVAL_MS` from `shared/`, times a tolerance, so a shot a
   few milliseconds early is treated as jitter rather than eaten. The client
   enforces the same interval for feel; this is here because fire *rate* is the
   property of a shot that reaches everybody.
11. **A shot is broadcast separately from its mark.** `mark` is where the pellets
   landed; `shot` is where the gun was. The kill path relays only `shot`, since
   there is no wall to mark.

## Contracts

- **`cling` is trusted like movement** — it only decides whether other clients
  play footsteps for you, so a liar makes themselves quiet and nothing else.
- **Reads `../shared/protocol.ts`** for `Role`, `ROOM_LIMIT`, `POSE_COUNT`,
  `MAX_STROKES`, `MAX_STROKE_LENGTH`. Do not re-declare any of them here.
- **Messages in** (`room.ts` ← `net/send.ts`): `state`, `paint`, `clearSkin`,
  `shoot`, `kill`, `whistle`.
- **Messages out** (→ `net/client.ts`): `shot`, `whistle` and `mark` to everyone; `paint`
  and `clearSkin` to everyone *except the sender*, who already drew it locally;
  `killed` to everyone, carrying the clamped death position so `sound/` can place
  it.
- **`/api/sessions`** returns `{self, sessions}` and is consumed by
  `net/sessions.ts`. The browser rewrites `self.host` to `location.hostname`,
  because a server does not know which of its addresses you reached it by.
- **Discovery is best-effort.** A failed UDP bind logs a warning and the game runs
  on regardless — you just have to type the host's address yourself.

## Testing it

Headlessly, and you should: drive two `colyseus.js` clients from a scratch `.mjs`
script in the project root (so `node_modules` resolves) against a running server,
assert what each sees, then delete it. Join, clamping, paint relay and non-echo,
the late-joiner backlog, a hider's kill being rejected and a seeker's producing a
grave are all checkable that way in about 60 lines.

## Not built yet

No round flow (hide phase, timer, win condition), no lobby or ready-up, no
health — a hit is instantly fatal. `allowReconnection` is unused: a dropped
player is simply gone, and a respawn is a fresh join.

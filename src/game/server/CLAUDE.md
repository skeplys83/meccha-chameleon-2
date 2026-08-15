# server — the authoritative half

**Owns:** the Colyseus rooms and their state, the matchmaking between them,
same-network discovery over UDP, and the HTTP bootstrap that serves the client.

**Entry point:** `node src/game/server/index.ts`, which is what both `npm run
dev` and `npm start` run. Vite has no dev server of its own here — it runs as
middleware inside this one — and there is no build step for the server at all:
**Node strips the TypeScript itself** (22.18+ / 23.6+).

It lives under `src/game/` with the client, but it is a *different runtime*: this
code never reaches the browser, and nothing here may import from `world/`,
`figure/`, `paint/`, `players/`, `combat/` or `hud/`. The only shared ground is
`../shared/protocol.ts`.

## Files

- `index.ts` — starts discovery, serves `/monitor` and `/api/sessions` itself
  and hands everything else to the app (Vite in middleware mode in development,
  `express.static("dist")` in production), defines both room types, starts
  Colyseus, prints the banner.
- `room.ts` — `GameRoom`: the shape of a round. Which phase it is in, who is in
  it, when it ends, and every hand-off between the two rooms.
- `messages.ts` — everything a client may *say*, and the trust model that decides
  what to believe. Movement, paint, the trigger, the whistle, and the clamping
  that keeps a `NaN` off the wire.
- `host.ts` — `HostRule`: who holds the Start button. Three pieces that only make
  sense together, kept together.
- `schema.ts` — `Player` and `GameState`, the synced state.
- `code.ts` — the invite alphabet and a code no live room is using.
- `monitor.ts` — Colyseus's admin panel at `/monitor`, and the rule for when it
  is allowed to exist.
- `discovery.ts` — the UDP socket, the peer table, the session name.

## Why it is four files and not one

`room.ts` was eleven hundred lines, and the seams it split along are real ones
rather than lines drawn to shorten a file:

- **A round's shape** (`room.ts`) and **the traffic inside it** (`messages.ts`)
  barely touch. One owns phases, capacity and the two hand-offs; the other owns
  what arrives twenty times a second from each browser. The handlers reach back
  for four things, marked `@internal`, and nothing else.
- **The host rule** (`host.ts`) knows nothing about rooms, clients or schema.
  `room.ts` tells it who is standing here and whether a match is running; it
  answers with a session id. It was three fields and a method tangled through
  `onCreate`, `onJoin`, `onLeave` and the sweep, and reading it meant finding all
  four.

The rate limiters moved with the handlers, because a trigger-pull sends exactly
one of `shoot` or `kill` and **one clock rate-limits the pair** — a fact that
only ever mattered to the code that is now in `messages.ts`. `room.ts` keeps a
single `forgetFire` callback so a departing seat is dropped from them, rather
than a reference to the maps.

## Lobbies and matches

One class, two registered names. A **lobby** is the waiting room: it runs the
arena, it is playable, and it owns a short invite code. A **match** is the game
proper on the chosen map, created by a lobby and lasting as long as that map
says. They
differ in which map they run, whether Start exists, how roles are assigned, and
whether there is a clock — everything else (movement, paint, kills, whistles) is
identical, which is why it is one class. `this.roomName` is what tells them
apart.

The cycle is: lobby → **countdown** → match → the clock runs out → back to the
same lobby → countdown again. `state.lobby` is the one field that makes the return trip
possible, and it is set in both directions: a lobby's own code, and for a match
the lobby that opened it.

**A lobby dies when it has no players *and* no live match**, checked by a sweep
every fifteen seconds — not when its last player leaves. `autoDispose` is off
precisely so it can sit empty for the minute its match is running. A match is the
opposite: ordinary `autoDispose`, gone as soon as its last client leaves.

**A lobby is listed unless its creator said otherwise; a match never is.**
`setPrivate` hides a room from the directory the listing queries but does *not*
lock it, so the invite code works identically either way. Unlisted therefore
means "you need the code from me", not "you cannot get in" — and that
distinction is the entire mechanism behind both the public flag and the
unreachable-by-browsing match.

Many rooms in one process needs **no Redis**. The driver (the room directory
`matchMaker.query` reads) and presence (pub/sub) both default to their Local
versions, which are an in-process array and an in-process emitter. Redis buys
one thing: spanning *processes*. Reach for it the day there is more than one.

The client half is `game/net/` — see its doc for the receiving end of every
message named here.

## The four phases, and who owns each clock

```
lobby   waiting ──▶ countdown(10s) ──▶ hiding(20s) ──▶ waiting
                         │  draw hunter    │  hunter waits here
                         │  chameleons ───▶│──── sendHunter ────▶
match                    └──────────────▶ hiding ──▶ hunt ──▶ reveal(30s) ──▶ home
```

**The match owns the deciding clock.** One `clock.setInterval` drives all three
of its phases; each sets the seconds for the next and the same tick keeps
counting. Not a timer per phase — two timers are two things that can disagree,
and the number on screen must be the one that decides what happens next.

**The lobby's hiding countdown is a display mirror and decides nothing.** The
hunter is standing in the lobby watching it, so it has to show a number; but the
phase ends when the *match* calls `sendHunter`, never when this interval reaches
zero. That is why it does not violate invariant 17: two clocks are a problem when
both can end the phase, and only one of these can.

**A round's length is a property of the map**, read through `mapRoundSeconds`
from `world/maps.ts`. The hiding phase is carved out of it rather than added to
it, so "five minutes" means five minutes. That import was the first thing outside
the browser to read map data, and it only works because the registry and
everything under it are free of React and three.js and use relative `.ts` paths.

**So is a map's size.** `messages.ts` clamps every reported position to
`mapLimit(room.state.map)` rather than to a single `ROOM_LIMIT`, because the
dungeon is 52 across and the arena 40. A global bound did not error — it just
amputated whichever map was bigger, so a player walking the dungeon's outer rooms
appeared to everybody else to be stuck sliding along an invisible wall at ±19.9.
Both clamps are in the `state` and `kill` handlers and must move together: `kill`
records where a body was found, and a grave outside the bound is a marker nobody
can walk to.

## The countdown, and how a round begins

**Nothing opens a match directly.** Two things ask for a round — the lobby
filling to `maxPlayers`, and the host pressing Start — and both go through
`beginCountdown()`, which runs `COUNTDOWN_SECONDS` and then calls `start()`. One
way in means one thing to cancel and one place a round can begin from.

It is idempotent by guard rather than by luck: asking again while it runs is
ignored, so the last player through the door does not reset the clock for
everybody. And it **cancels back to `waiting` if the roster drops below
`MIN_PLAYERS`**, checked both on the tick and in `onLeave` — the tick alone would
leave the panel counting for up to a second after the room stopped being able to
start.

**A countdown closes the lobby.** From the moment it starts, `onJoin` turns away
anybody this game has not already seen — the same rule and the same `HostRule`
lookup that guards a running match, with its own leave code so the client can say
which of the two happened. Two reasons, and the second is why it exists:

- **The draw is over who is present at zero.** A latecomer at second nine changes
  everyone's odds of being the hunter after the countdown they are watching has
  already begun.
- **They have no time to load the map.** Everyone else has been preloading it
  since they arrived in the lobby (`world/preload.ts`); a player who joins at
  second nine has nine seconds, and is moved to the map at zero. They arrive in a
  world with no floor, during the hiding phase, where nobody can see it happening
  to them.

Known players still get in, so a wifi blip inside the ten seconds is not an
ejection from a round you were part of, and `cancelCountdown` reopens the door
immediately.

## The monitor is the only window into the matchmaking

`/monitor` is the server's view: which rooms exist right now, how many clients
each holds, and this game's own metadata — `host` and `map` are only ever set on
a lobby, so a row with them filled in is a waiting room and a row without is a
match. Opening a room shows its **full state tree**, live, through
`getInspectData`, which is the only way to watch `phase`, `timeLeft` and each
player's `role` change without being in the room.

That last part matters: it observes **without taking a seat**. Colyseus's
`@colyseus/playground` was tried here and removed for exactly that reason — its
client is a real player, so it counts toward `maxPlayers`, enters the hunter
draw, and cannot follow the `moveTo` hand-off into a match. Using it to watch a
round is using it to break the round. Anything observational belongs here.

## Capacity

`maxClients` is the cap and Colyseus enforces it before `onJoin` ever runs;
`state.maxPlayers` is the copy the client may read. The number arrives from a
client, so it is clamped into `[MIN_PLAYERS, MAX_PLAYERS]` rather than trusted.
A match is created with the same cap.

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
3. **Nothing here touches `upgrade`.** This HTTP server carries the page and
   `/api/sessions`; Colyseus binds `GAME_PORT` and builds its own server there;
   and in development Vite's HMR socket binds `HMR_PORT` of its own. and in development Vite's HMR
   socket binds `HMR_PORT` of its own rather than being handed this server via
   `server.hmr.server`. Handing a WebSocket server the HTTP server's `upgrade`
   event destroys every non-matching upgrade, including the dev HMR socket —
   which stops the client bootstrap, so **nothing mounts and no button on the
   page works**. The symptom is "connection refused" plus a completely dead UI.
   Three listeners is the cost of never rediscovering that.
4. **State is what a late joiner still has to see.** Paint strokes and graves are
   permanent, so they are schema fields and arrive via `onAdd` backlog. Shot
   marks expire after three seconds, so they are a `broadcast` and are never
   stored. Getting this backwards means either a blank body on join or a room
   full of ghost marks.
5. **Movement is trusted, kills are not.** Clients simulate themselves and report
   their position; the server only clamps it into the arena. A kill is checked —
   this must be a match, caller must be a hunter, victim must exist and not be
   the caller — because it is the one message where a wrong client changes
   someone else's game.
6. **The victim is told before they are dropped.** `killed` is broadcast, then the
   victim is deleted from state, then `leave()` fires 250 ms later. Without the
   delay they disconnect before the message lands and see nothing but a dropped
   connection.
7. **A schema `boolean` must be coerced, not assigned**, and `cling` is checked
   against the role besides. `player.cling = player.role === "chameleon" &&
   msg.cling === true` — never `= msg.cling`, because the encoder will take a
   string or an object and hand it to every client, and never without the role,
   because clinging is what silences your footsteps for everyone else. A hunter
   who could set it would hunt in silence. Same instinct as `clamp` for numbers,
   and the same role mirror as the kill and whistle handlers.
8. **Non-finite input becomes 0, never `NaN`.** That is what `clamp` is for. A
   `NaN` written into schema propagates to every client.
9. **A whistle is relayed, never stored, chameleon-only, and rate-limited like a
   shot.** It only gives a position away, so it is trusted the way movement is —
   but *rate* reaches everybody, so `MIN_WHISTLE_GAP_MS` stops a client turning
   theirs into a siren. The role check mirrors the kill handler's: a kill refuses
   anyone who is not a hunter, a whistle refuses anyone who is not a chameleon. A
   player who has left the room cannot whistle at all.
10. **One trigger, one clock.** `canFire` rate-limits `shoot` and `kill` together,
   per client, because a trigger-pull sends exactly one of the two — never both.
   The gap is `FIRE_INTERVAL_MS` from `shared/`, times a tolerance, so a shot a
   few milliseconds early is treated as jitter rather than eaten. The client
   enforces the same interval for feel; this is here because fire *rate* is the
   property of a shot that reaches everybody.
11. **A shot is broadcast separately from its mark.** `mark` is where the pellets
   landed; `shot` is where the gun was. The kill path relays only `shot`, since
   there is no wall to mark.
12. **The invite code *is* the `roomId`, and it may only be set in `onCreate`.**
   The setter throws at any later point in the room's life — verified in
   `Room.js`, not assumed. That is also what makes the invite free: no token
   store, no second lookup, and `client.joinById(code)` is the whole join path.
   The alphabet omits `I`, `O`, `0` and `1`, because a code exists to be read
   out loud.
13. **A lobby does not auto-dispose.** Starting a match moves every client out at
   once, and an auto-disposing room would take the invite code down in that gap.
   The `sweep` interval ends it instead: no players *and* no live match. The
   same sweep is how a lobby learns its match has died, which is what lets a
   group start a second game.
14. **Start is idempotent-by-flag.** It is async and it is a button; two presses
   without the `starting` guard would open two matches and send half the room to
   each.
15. **A seat reservation is the only supported way to move a client**, and it is
   held for fifteen seconds by default. That is the entire budget for every
   client to consume theirs, so a failure is *sent* (`moveFailed`) rather than
   assumed away — a player who does not make the trip is still sitting in the
   lobby and needs telling.
16. **The hunter is drawn in the lobby, at Start, and never chosen.** Everybody
   waits as a **hunter**; exactly one of the clients making the trip keeps that
   on their seat reservation and the rest are reserved as chameleons. It happens
   there rather than in the match because the draw needs the whole roster at
   once and the match has no players yet — its seats are what is being handed
   out. A lobby therefore *ignores* a role option outright; a match honours one,
   because that is where the reservation's answer arrives and where a respawn
   says which side it was already on.
17. **One clock, not two.** The match's countdown is a single
   `clock.setInterval` that decrements `state.timeLeft` and calls `finish()` when
   it hits zero — not a countdown for display *plus* a `setTimeout` to end
   things. Two timers are two things that can disagree, and the number on screen
   has to be the one that decides the game is over. It is `this.clock`, Colyseus's
   own timing, which is ticked from the patch loop and therefore stops with the
   room; a bare `setInterval` would outlive it.
18. **An unset schema number is absent, not zero.** A lobby writes
   `timeLeft = 0` explicitly. Leaving it alone means the field never appears in
   the encoded state and the client reads `undefined` where it expects "no clock
   is running" — which is how this was caught.
19. **A drop is not a departure.** `onLeave`'s `consented` flag separates them:
   true when the client asked to go (quitting, or being handed to another room),
   false when the socket died. Only the second gets `allowReconnection`, and only
   in a match — a lobby is cheap to walk back into by its code, while a match
   holds your side, your position and your paint, none of which a fresh join can
   restore. The player **stays in state** while the seat is held, so their body
   is still standing there and is still shootable: dropping must not be a way to
   become invulnerable. That is why the kill handler rejects any pending return
   for its victim — coming back to a room you have just been deleted from would
   be a body with nobody behind it.
20. **A match takes a role only from a seat its lobby reserved.** Reservation
   options and a client's own join options arrive at `onJoin` in the same
   argument and are otherwise indistinguishable, so the lobby mints a `pass`,
   passes it in `createRoom` and includes it in every reservation. Without it,
   any chameleon could leave a match and rejoin by its id claiming the gun — and
   every player in a match knows its id. A join with no valid pass is a chameleon,
   which is the right answer for the only case that reaches it: a dead player
   respawning is necessarily a chameleon, since a hunter cannot be shot.
21. **A `kill` is refused outright in a lobby.** Everyone waiting is armed, and a
   kill drops its victim from the room and onto a death screen — so honouring
   one there means being shot out of the game you are queuing for. `shoot` is
   untouched: the bang and the wall mark are harmless, and a waiting room where
   the gun does nothing at all would read as broken. This is the one rule that
   does not follow from the role check, precisely because in a lobby the role
   check passes for everybody.
22. **The arena is not a match map.** It is where every lobby waits, so
   `MATCH_MAP_IDS` is what both `onCreate` and `setMap` validate against.
   Accepting it would mean pressing Start and arriving where you already were.
23. **`listed` is decided at creation and never again.** It is a `create`
   option, mirrored into schema so the lobby panel can say which it is, and it
   drives one `setPrivate` call. Nothing changes it later: a game that went
   public while people were already inside would be a surprise nobody consented
   to, and the room id — the code — is what actually admits people either way.
24. **A game's population is both of its rooms.** Once a match starts its players
   have left the lobby, so a listing that counted only the lobby would show a
   game in full swing as empty. The lobby publishes its `matchId` in metadata
   and `index.ts` adds that room's clients back. Nothing pushes the count
   anywhere — it is computed per request, so it cannot go stale.
25. **The host is the present player who has been in this game longest, and the
   creator therefore keeps it.** Three pieces make that true, and removing any
   one of them puts the button back on a coin-toss:

   - **`firstSeen`, by player id, kept for the room's whole life.** Arrival
     *order* is no use — everyone leaves for the match and comes back with new
     session ids in whatever order their reservations landed, so ordering by the
     current join is just "first back". The creator is earliest-seen by
     construction, which is why they need no special case.
   - **Nothing is reassigned while a match is running, or for ten seconds after
     it ends.** A lobby is empty for that whole minute; without the gate the
     button falls to the first stranger to use the invite code. The grace window
     covers the return, when everyone arrives at once and the host is not
     necessarily first through the door.
   - **The player id is forwarded through both hand-offs.** Lobby → match and
     match → lobby both carry `pid` in the seat reservation. Drop it from either
     and the host comes home a stranger.

   `hostId` in state is still a *session* id — that is what the client compares
   itself against — and it is now legitimately empty while a match runs.
26. **A player id is a claim, not a credential**, and it is `sessionStorage` on
   the client, never `localStorage`: two tabs on one machine is how this game
   gets tested, and shared storage would make both of them the same player and
   both of them the host. Anyone could send someone else's id; the worst it buys
   is a Start button, which is the same trust model as everything else here.
27. **The admin panel is not read-only, and is off by default in production.**
    Its basic-auth realm is the game's own name, so a browser's password prompt
    says what it is asking for; renaming the game means renaming that too.
   Its API exposes `matchMaker.remoteRoomCall`, which invokes any method on any
   room by name — `disconnect`, and this project's own `matchEnded` among them —
   so anyone who can reach it can end anybody's game. The rule is that a
   password is what turns it on: on in development with none (only you can reach
   localhost, and `MONITOR=0` opts out), and in production it is *not mounted at
   all* unless `MONITOR_PASSWORD` is set, then behind Basic auth. Forgetting the
   password fails closed. `createMonitor` returns `null` rather than an
   always-403 handler on purpose — an unmounted route cannot be probed, and
   `/monitor` should look like any other unknown path.
28. **The panel fetches Material Icons from Google, and nothing can be done
   about it here.** Its HTML — third-party markup inside `@colyseus/monitor` —
   links `fonts.googleapis.com`, so on a Wi-Fi with no uplink the panel loads and
   works but every icon renders as its literal ligature text (`more_vert`,
   `delete`). It reads as broken and is not. This is the one place trap 3's
   no-CDN rule is violated by a dependency rather than by us; fixing it would
   mean patching the package or proxying the font, and it is admin UI rather than
   the game.
29. **The panel is pinned to `@colyseus/monitor@0.16.x`.** Its 0.17 line depends
   on `@colyseus/core@^0.17`, which npm installs *alongside* our 0.16 rather than
   refusing — a second matchMaker, in the same process, that knows about none of
   our rooms. The panel loads and lists nothing, with no error to explain it.
   Four things move together; the check after any bump is
   `find node_modules -type d -name core -path "*@colyseus*"`, which must return
   exactly one line.
30. **The panel's route is checked before `/api/sessions` and before the app.**
   The app is the fall-through and it answers *everything*: Vite's SPA middleware
   in development, and in production an `express.static` that falls back to
   `index.html`. A panel mounted after it would never be reached. That fallback
   is also what keeps invariant 27 honest — with no `MONITOR_PASSWORD` set,
   `/monitor` returns the game page exactly as `/anything-else` does, so an
   unmounted panel still cannot be told apart from an unknown path.
31. **A lobby admits only known players while its match runs, and this is a
   capacity rule.** `reserveSeatFor` *respects* `maxClients` — `Room._reserveSeat`
   returns false once `hasReachedMaxClients()`, which was read in the source
   rather than assumed. So a stranger who took a lobby seat while the match was
   out would make the trip home fail for whoever reserved last, leaving them in a
   room that is about to dispose holding a `moveFailed` and no way back. `onJoin`
   therefore turns away any player id `firstSeen` has never recorded, for as long
   as `matchId` is set. Someone walking back out of the match is known, so
   quitting a round still lands you in the lobby.
32. **A countdown is a `clock.setInterval` that is *held*, not fired and
   forgotten.** `this.counting` exists so it can be cleared — by a leaver, or by
   reaching zero. A countdown that outlived its second player would start a round
   for one person. It is also read as a *state*: `onJoin` refuses strangers while
   it is non-null, and `publish` puts it in metadata as `starting` so the menu
   does not offer a game it would be bounced from.
33. **The lobby stays in `hiding` until the hunter has actually been handed
   over.** The bell is not a message — it is the phase changing from `hiding` to
   `hunt`, which every client reads for itself. Clearing the lobby to `waiting`
   before the hand-off meant the hunter's last sight of it was `waiting`, so
   their arrival read as `waiting → hunt` and **no bell rang for the one person
   it is about**. Setting it afterwards leaves them `hiding → hunt`, the same
   transition the chameleons already see, so exactly one bell reaches everybody.
34. **Only the chameleons travel at Start; the hunter is fetched later.** `start`
   hands over everyone *except* the drawn hunter, who stays in a lobby that is a
   playable arena for the whole hiding phase — they cannot watch anybody choose a
   spot, because they are not in the room where spots are chosen. `sendHunter` is
   public for the same reason `matchEnded` is: `matchMaker.remoteRoomCall`
   reaches it by name. The round's `pass` is kept on the lobby precisely because
   that second reservation happens a whole phase after the first.
35. **A catch converts, it does not kill.** The victim stays in the room, their
   `role` flips to `hunter`, their pose and cling reset and their strokes are
   cleared — with a `clearSkin` broadcast, because everyone else is who has to
   stop seeing the camouflage. There is no `leave()`, no death notice delay and
   no respawn. `kill` is refused unless `phase === "hunt"`, so the reveal cannot
   be played through, and it refuses a victim who is already a hunter, which also
   makes a duplicated message harmless.
36. **A round ends two ways and both go through `finish`.** The hunt clock
   expiring is `chameleons`; the last chameleon converting is `hunters`. **The
   last chameleon *leaving* counts too** — checked in `onLeave`, and only during
   a hunt, or an early quitter during the hiding phase would hand the round to
   nobody. Without it the hunters sweep an empty map for the rest of the clock,
   which reads as the game having hung.
37. **`finish` does not send anyone home; `goHome` does, thirty seconds later.**
   The reveal is the difference between a hunt that ends with an answer and one
   that cuts to a menu, so the world stays up with the survivors in their spots
   and the graves where people were found. `winner` is in schema rather than
   broadcast because thirty seconds is long enough to reconnect inside.
38. **`matchId` is cleared in `goHome`, not in `finish`.** It gates the
   admits-only-known-players rule of invariant 30; clearing it early would let
   strangers take lobby seats during the reveal and break the trip home.
39. **`start` refuses while a match is live**, and `matchEnded` is how the lobby
   learns otherwise. The sweep would notice within fifteen seconds, which is fine
   for bookkeeping and far too slow for a person standing there pressing a button
   that does nothing. `matchEnded` is public because `matchMaker.remoteRoomCall`
   reaches it by name.
40. **A refusal is a leave code from `shared/protocol.ts`, never a bare number.**
   `LEAVE_IN_PROGRESS` and `LEAVE_STARTING` are the two, and the client turns
   each into the sentence a person reads — which is exactly why they are shared
   rather than local: a `4001` written here and a `4001` matched there is the
   mirrored constant this repo keeps deleting. Note that the server *accepts* the
   socket and then closes it, so to the client a refusal is indistinguishable
   from a leave that happens to land before the state does. `net/client.ts` has
   to reject the pending join on it; before these codes existed, the join simply
   hung.

   The rest of the old note still holds: There are no accounts. It is the first
   to join, reassigned to whoever remains, and it is only ever consulted to
   decide who may press Start or change the map. Both messages are checked
   server-side; hiding the buttons is a display rule on top of that, not instead
   of it.

## Contracts

- **`cling` is trusted like movement** — it only decides whether other clients
  play footsteps for you, so a liar makes themselves quiet and nothing else.
- **Reads `../shared/protocol.ts`** for `Role`, `POSE_COUNT`,
  `MAX_STROKES`, `MAX_STROKE_LENGTH`, `MAX_STROKE_BATCH`, and the fire and
  whistle intervals. Do not re-declare any of them here — a pre-commit gate
  fails the commit if you do.
- **Reads `../world/mapIds.ts`** to validate a chosen map. That file is
  import-free precisely so this side can read it: `maps.ts` pulls in React and
  three.js and would not load here at all.
- **A room's own map never changes.** A lobby is always the arena; a match is
  fixed at creation. What the host can move is `nextMap` — the map the *next*
  match will use — because geometry cannot move under players standing on it.
- **Messages in** (`room.ts` ← `net/send.ts`): `state`, `paint`, `clearSkin`,
  `shoot`, `kill`, `whistle`, plus `start` and `setMap` from the host of a lobby.
- **Messages out** (→ `net/client.ts`): `shot`, `whistle` and `mark` to everyone; `paint`
  and `clearSkin` to everyone *except the sender*, who already drew it locally;
  `killed` to everyone, carrying the clamped death position so `sound/` can place
  it; `moveTo` (a seat reservation, per client) and `moveFailed`.
- **There is no "match over" message.** `moveTo` is the news. A second one would
  only be a message the client has to remember to register a handler for, and
  Colyseus warns about every message type that has none.
- **`/api/sessions`** returns `{self, sessions, games}` and is consumed by
  `net/sessions.ts`. The browser rewrites `self.host` to `location.hostname`,
  because a server does not know which of its addresses you reached it by.
- **The listing is served here because Colyseus 0.16 has no room-list route.**
  Its HTTP matchmaking endpoint exposes only the join methods and the browser
  client has no `getAvailableRooms`, so `publicGames()` reads `matchMaker.query`
  in the process that owns the room directory. It queries lobbies and matches
  together, since a game's count spans both.
- **Discovery is best-effort, and optional.** A failed UDP bind logs a warning
  and the game runs on regardless. `LAN_DISCOVERY=0` skips it entirely, which is
  what a hosted server wants: there are no peers to broadcast to. `/api/sessions`
  still answers with `self`, and `self` is the entry the menu actually joins, so
  the game works with discovery off.
- **`PUBLIC_GAME_PORT` is what clients are told, `GAME_PORT` is what we bind.**
  They are the same when served directly. Behind a reverse proxy they are not: TLS is
  terminated on 443 and forwarded to 2567, so the browser must be handed 443 —
  both because it cannot reach the internal port, and because a `wss://` page is
  forbidden from opening a plain `ws://` socket.

## Testing it

Headlessly, and you should: drive two `colyseus.js` clients from a scratch `.mjs`
script in the project root (so `node_modules` resolves) against a running server,
assert what each sees, then delete it. Join, clamping, paint relay and non-echo,
the late-joiner backlog, a chameleon's kill being rejected and a hunter's producing a
grave are all checkable that way in about 60 lines.

The matchmaking is *especially* worth testing this way, because almost none of
it is visual: two `create` calls giving two different rooms, `joinById` on a
code, a wrong code being refused rather than creating a room, a guest's `start`
and `setMap` being ignored, the arena refused as a match map, everyone waiting
as a hunter, a kill in the lobby refused while the shot still bangs, a public
game listed and an unlisted one absent *but still joinable by code*, the count
holding steady across the start because it spans both rooms, every client
landing in one match with **exactly one hunter** between them, a client's
claimed `role: "hunter"` refused on a plain match join, the lobby surviving its
own start, the button changing hands, and paint arriving in the match. The draw
is worth looping a couple of dozen times to prove it is not always the host.

The clock and the reconnection both test well too, and neither is visible from
the outside. Close a client's socket with
`room.connection.transport.ws.close()` — that is a *drop*, where `room.leave()`
is not — then `client.reconnect(token)` and assert the same session id, side,
position and paint come back. For the round trip, start a match and wait the
whole round for the `moveTo` home; it is a slow test but it is the only
one that proves the timer ends anything. Consume the `moveTo` seat in the script
exactly as the client does — that is the step most likely to break.

## Not built yet

No hide phase and no win condition — the clock ends a match, but nothing counts
who survived it, so a round has a length and no result. No ready-up: a lobby is
a place to wait, not a checklist. No health: a hit is instantly fatal. A
respawning player rejoins the match they died in, with whatever is left on its
clock.

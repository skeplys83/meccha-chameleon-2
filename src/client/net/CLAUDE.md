# net — the client's half of the wire

**Owns:** the Colyseus connection, which room you are in, the remote players'
transforms, and every message in and out.

## What's here

| file            | what                                                          |
| --------------- | -------------------------------------------------------------- |
| `client.ts`     | joining, attaching a room, and the three ways one ends          |
| `connection.ts` | the socket, the endpoint, and `selfId()`                        |
| `events.ts`     | the subscriptions the rest of the app listens on                |
| `remotes.ts`    | live transforms for everyone else, mutated in place             |
| `send.ts`       | every message this client sends                                 |
| `sessions.ts`   | `/api/sessions`, for the menu's game list                       |
| `identity.ts`   | the per-tab player id                                           |
| `index.ts`      | the barrel other folders import from                            |

## Three doors, one room at a time

`createLobby`, `joinLobby` and `rejoin` are the ways in; a `moveTo` from the
server is the way *across*. Only one room is attached at a time, and a move
overlaps the two deliberately — the new seat is consumed before the old room is
let go, because a reservation is held for only fifteen seconds.

## The three rules that will bite you

1. **`onLeftRoom` fires *before* the next room is attached, at all three moments
   a room ends.** A room replays its whole state on join, so a listener that
   cleared afterwards would wipe the backlog it had just been sent. Everything
   that belongs to a room resets on this one event — paint, sounds, marks,
   graves, remotes. Do not add a second mechanism.
2. **A refused join must *reject*, not wait.** The server accepts the socket and
   then closes it with a leave code, so to the client a refusal is
   indistinguishable from a leave that beat the state. Before
   `LEAVE_IN_PROGRESS` / `LEAVE_STARTING` existed, a join into a starting lobby
   simply hung.
3. **`remotes` lives outside React and is mutated in place.** Re-rendering on
   every movement patch is sixty renders a second per player. `onRoster` fires
   only when somebody joins or leaves.

## Contracts

- **A join must never dereference a missing target.** The menu can render with
  an empty or stale session list; the correct behaviour is a normal error before
  the join reaches the socket layer — never a crash on `undefined.name` while
  still building the error message.
- **The player id is `sessionStorage`, never `localStorage`.** Two tabs on one
  machine is how this game gets tested; shared storage makes both the same
  player and both the host.
- **A move drops every skin, yours included** — session ids are per room.
- **`cling` on the wire is a surface, not a flag** (`CLING_*` in `shared/`).
  `sound/` still reads it as truthy-means-climbing; `figure/` reads *which*
  surface, to decide which way up to draw a pose that lies flat. It rides in the
  same `state` message as everything else, twenty times a second.
- **The browser-facing socket port is normalized before a join**, because behind
  a TLS proxy the port we bind is not the port a browser can reach.

---

Eighteen invariants and the full message table:
[docs/notes/net.md](../../../docs/notes/net.md).

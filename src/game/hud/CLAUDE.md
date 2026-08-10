# hud — the 2D overlays

**Owns:** everything drawn in DOM over the canvas, and the menu you see before
you join.

**Entry points:** `RoleMenu`, `PauseMenu`, `ControlsPanel`, `PlayerList`,
`DeathScreen`, `randomName`.

## Files

- `RoleMenu.tsx` — name entry, role buttons, the map picker, the LAN session
  list.
- `PauseMenu.tsx` — resume / leave.
- `ControlsPanel.tsx` — the key legend, one per role.
- `PlayerList.tsx` — who else is connected.
- `DeathScreen.tsx` — respawn or exit.
- `names.ts` — random fallback player names.

## Invariants

1. **This folder never imports from `world/`, `figure/`, `players/` or
   `combat/`.** It renders outside the Canvas and talks to the game through
   `Game.tsx` props and through `net/`. The one exception is reading `POSES` for
   the legend — a label, not behaviour.
2. **Not every difference between the roles is a key.** Only hiders whistle, and
   nothing on either card says so — there is no key for it and nothing to press.
   The legend is for controls; role asymmetries that are not controls belong in
   `players/CLAUDE.md` and `sound/CLAUDE.md`, not here.
3. **`ControlsPanel` holds one legend per role and they are not built from a
   shared base.** If a row is on a card, that role must really have it wired up
   in `players/Player.tsx`. A hider has no shoot; a seeker has no pose, no
   `Q`/`E`, no zoom and no climb, so none of those may appear on the wrong card.
   Climbing has **no key of its own** — you attach by walking into a surface — so
   it is written onto the `W A S D` and `Space` rows rather than given one. A row
   here is a promise that a key does that thing; inventing one for a mechanic
   that has no key would be a lie on the card. Those two files
   are the contract.
4. **The player name is per tab, in `sessionStorage`, not a cookie.** Two tabs on
   one machine is how you test two players locally, and a cookie made them share
   and clobber one name. `RoleMenu` also expires the old `mc_name` cookie on
   mount. Nothing else is persisted — the session you pick is chosen fresh every
   time.
5. **Nobody should have to invent a name to play.** A tab with no stored name
   gets a random reptile plus two digits; the digits are what stop two people
   picking "Gecko" from being indistinguishable.
6. **The map picker is always shown, even while there is one map.** It is the
   standing answer to "which map am I about to play", and a control that appears
   only once a second map exists is one nobody knows is there. It lists whatever
   `world/maps.ts` holds, so a new map needs no change here. Its note says the
   choice applies only if you start the session, because that is the truth: a
   later joiner takes the room's map.
7. **The pause menu leaves only by its own button**, and says so on the card.
   Esc raises it and cannot dismiss it — see `players/CLAUDE.md` invariant 1 for
   why that is a pointer-lock rule rather than a menu one. Do not "fix" the
   asymmetry by wiring Esc back up.
8. **The pause menu has no full-screen scrim** — the arena stays visible while
   you are paused — but the panel itself needs a solid ground, because it floats
   over a white room and translucent pills left the session name unreadable.
9. **The session list is polled, not pushed.** `fetchSessions` every 2 s against
   the local server, which is the thing actually listening for UDP broadcasts.

## Contracts

- **`Game.tsx` owns every mode transition.** This folder raises intent
  (`onJoin`, `onResume`, `onLeave`, `onRespawn`, `onExit`) and renders state; it
  decides nothing. In particular `PaintPanel` — which lives in `paint/`, not here
  — can clear `paused` as a side effect of opening, which is why `Game.tsx`
  guards hover reporting while the menu is up.
- **Reads `net/`** for `fetchSessions`, `onRoster` and `remotes` (the player
  list) — never the senders.
- **Reads `shared/protocol.ts`** for `Role` and `figure/poses.ts` for pose labels.

## Not built yet

No lobby or ready-up, no scoreboard, no chat, no settings (sensitivity, volume,
FOV), and no round timer — there is no round.

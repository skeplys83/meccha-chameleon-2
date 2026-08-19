# app — the composition roots

**Owns:** the top-level state, the mode transitions, the Canvas, and the four
things that decide when anything heavy is downloaded.

## What's here

| file            | what                                                          |
| --------------- | --------------------------------------------------------------- |
| `Game.tsx`       | top-level state and every overlay. ~30 lines of state, one JSX tree |
| `session/`       | the hooks it is composed from — one mechanism each              |
| `Scene.tsx`      | Canvas, Physics, frame priorities, mark and grave lifetimes    |
| `crazygames.ts`  | the portal SDK, inert unless a crazygames.com frame is above us |
| `loading.ts`     | one counter: is the player waiting on something to arrive      |
| `dev.ts`         | developer mode, and the player snapshot the readout samples    |

## The hooks

`Game.tsx` used to be 726 lines and 26 effects. Each hook below owns one
mechanism and the prose that explains it; the component is now composition.

| hook                    | owns                                                  |
| ----------------------- | ------------------------------------------------------- |
| `usePauseControl`       | pause, palette, pointer lock — and their exclusion      |
| `useNetEvents`          | every `net/` subscription, including the room reset     |
| `useRoundAudio`         | the tick, the bell, the gong                            |
| `useRoundAssets`        | the map and music preloads                              |
| `useRoomGraves`         | graves, de-duplicated, dropped on `onLeftRoom`          |
| `useCaughtNotice`       | the three-and-a-half seconds after you are caught       |
| `useCrazyGames`         | invites, instant multiplayer, room reporting            |
| `useWhistle`            | a chameleon's periodic tell                             |
| `useDevHotkey`          | backquote                                               |

## The three rules that will bite you

1. **Anything that renders the world is keyed on the *room*, never on
   `joined`.** Local state flips on the click; room state arrives a few hundred
   milliseconds later. Keying the player on `joined` fell back to `"chameleon"`
   for that window and spawned you into the lobby as a small third-person figure
   before snapping to the hunter's camera. `<Player>` is keyed on the room's
   code, which is what rebuilds the body at each map's spawn point.
2. **`paused` and `painting` are mutually exclusive, and `usePauseControl` owns
   both** so no future path can forget. Losing the window was the exception that
   proved it: it set `paused` and left `painting` alone, hiding both the menu
   *and* the palette while the keys stayed dead.
3. **Nothing heavy is fetched on page load.** The Canvas is mounted behind the
   start menu, so anything on a mount effect is paid for by everyone who merely
   opens the game. There are four triggers and no others: the map and music on
   arriving in a lobby (and again at the countdown), the character and the eight
   small sounds on the join *click*.

## Contracts

- **A change of room is a clean slate**, and `net/`'s `onLeftRoom` is the one
  place that says so. Anything added later that belongs to a room resets there.
- **`Scene.tsx` owns the frame priorities**, the game's one ordering guarantee:
  `0` decides where things are, `1` copies a result of that (the viewmodel, the
  audio listener), `2` draws, `3` reads the drawn frame back. Mount order is not
  a substitute.
- **`Scene.tsx` passes the phase down as three separate facts** — `reveal`,
  `hunting`, `frozen` — because each is read by a different part of the tree.
- **Esc closes the pause menu for a chameleon and not for a hunter.** A hunter's
  Esc never reaches the app: the browser spends it releasing the pointer lock,
  and `pointerlockchange` is what raises their menu.
- **Developer mode is `import.meta.env.DEV`** and must not be reachable in
  production — not by an env var, not by a query parameter, not by a key. The
  point of tying it to the build is that there is no switch to find.

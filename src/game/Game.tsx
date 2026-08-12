import { useCallback, useEffect, useRef, useState } from "react";
import { StartMenu } from "@/game/hud/StartMenu";
import { ControlsPanel } from "@/game/hud/ControlsPanel";
import { PlayerList } from "@/game/hud/PlayerList";
import { PauseMenu } from "@/game/hud/PauseMenu";
import { PaintPanel } from "@/game/paint/PaintPanel";
import { DEFAULT_BRUSH, type Brush } from "@/game/paint/brush";
import { DEFAULT_MAP } from "@/game/world/mapIds";
import { LobbyPanel } from "@/game/hud/LobbyPanel";
import { DroppedPanel } from "@/game/hud/DroppedPanel";
import { PhaseBanner } from "@/game/hud/PhaseBanner";
import { RoundOverPanel } from "@/game/hud/RoundOverPanel";
import {
  createLobby,
  disconnect,
  joinLobby,
  onDropped,
  onCaught,
  onGrave,
  onLeftRoom,
  onMoved,
  onMoveFailed,
  onRoom,
  rejoin,
  selfId,
  sendClearSkin,
  sendWhistle,
  type Grave,
  type RoomInfo,
  type Session,
} from "@/game/net";
import { clearSkin, forgetAllSkins, SELF } from "@/game/paint/skin";
import { cancelLock, lockTargetEl, requestLock } from "@/game/players/pointerLock";
import {
  playSound,
  setAudioSuspended,
  startLoop,
  stopAllLoops,
  stopLoop,
  unlockAudio,
} from "@/game/sound/engine";
import {
  GONG_FALLOFF,
  GONG_GAP_MS,
  GONG_STRIKES,
  HUNT_URGENT_SECONDS,
  MUSIC_DELAY_MS,
  WHISTLE_INTERVAL_MS,
} from "@/game/shared/protocol";
import type { Role } from "@/game/shared/protocol";

import Scene from "./Scene";

export function Game() {
  /** Whether this client is in a game at all. Not the same question as which
   *  side it is on, which only the room can answer. */
  const [joined, setJoined] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  // `painting` means the palette is up. Hovering your own body opens it, and
  // from then on it stays open until it is minimised — a palette that closed
  // itself while you were mixing a colour would be maddening.
  const [painting, setPainting] = useState(false);
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("player");
  /**
   * Who caught you, for the few seconds the notice is up. Not a death: being
   * caught turns you into a hunter and you keep playing, which is why this is a
   * toast and not the screen it replaced.
   */
  const [caughtBy, setCaughtBy] = useState<string | null>(null);
  /** The connection died on its own. Distinct from every deliberate exit, and
   *  the only state where the game on screen is not connected to anything. */
  const [dropped, setDropped] = useState(false);
  /**
   * Which room this client is in and what it is doing — the waiting room or the
   * match, the map under your feet, the invite code, whether you hold Start.
   *
   * It is state rather than something read once on join, because a session is no
   * longer one room: you are moved from a lobby into its match, and the map and
   * the host can both change while you wait. `net/` pushes a new one on every
   * patch that alters any of it.
   */
  const [room, setRoom] = useState<RoomInfo | null>(null);
  /**
   * Where each chameleon was found this round.
   *
   * Owned here rather than in `Scene` because two things read it: the world
   * draws a marker at each spot, and the round-over panel lists the names. They
   * must be the same list — a second copy would be a second thing to clear.
   *
   * Graves are *state* on the server, so this receives the backlog on join as
   * well as each new one; `net/CLAUDE.md` invariant 4 has the why.
   */
  const [graves, setGraves] = useState<Grave[]>([]);
  /**
   * Which side you are on, read off the room rather than chosen.
   *
   * Nobody picks: everyone waits in the lobby as a hunter, and the draw at Start
   * turns all but one of them into chameleons. So this flips underneath the player
   * at the moment they arrive in the match. Every effect below keyed on it — the
   * pointer lock, the whistle, the legend, the viewmodel — re-runs then, which is
   * exactly right.
   *
   * The fallback matters, and used to be visible. `joined` flips the instant the
   * button is clicked while `room` only arrives when the connection settles, so
   * anything keyed on `joined` gets `"chameleon"` for those few hundred milliseconds
   * — which spawned you into the waiting room as a small third-person figure
   * before snapping to the hunter's first-person camera. `Scene` is keyed on
   * `room` instead, so nobody is drawn until the room has said which side you
   * are on.
   */
  const role: Role = room?.role ?? "chameleon";
  /**
   * Rooted where you are, camera free.
   *
   * A chameleon still on their feet when the round ends *is* the reveal — they
   * are lit red through the walls so everybody can see the spot that beat them,
   * and a spot they walk away from is not a spot. Hunters are not rooted: they
   * are the ones going to look. Everyone caught became a hunter, so this is
   * exactly the survivors.
   */
  const rooted = room?.phase === "reveal" && role === "chameleon";

  // Paint mode deliberately gives the cursor back, so the pointer-lock handler
  // below must not read that as "the player wants the pause menu".
  const paintingRef = useRef(false);
  useEffect(() => {
    paintingRef.current = painting;
  }, [painting]);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  /**
   * **Losing the window pauses the game, whoever you are.**
   *
   * A hunter got this for free — alt-tabbing drops the pointer lock, and losing
   * the lock is what raises their menu — but a chameleon never holds a lock, so
   * they came back to a world that had carried on without them. `Player` already
   * reads `NO_KEYS` while unfocused so they did not walk into a wall, but the
   * game was still live around them: whistling, being hunted, and taking a
   * catch they could not see coming.
   *
   * It does not un-pause on the way back. That is invariant 1: only a click on
   * Resume leaves the menu, because asking for the pointer lock in the same
   * gesture that returned focus is refused by the browser.
   */
  useEffect(() => {
    if (!joined) return;
    const away = () => setPaused(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away();
    };
    window.addEventListener("blur", away);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", away);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [joined]);

  // Pausing always hands the cursor back, whichever role you are, so the menu
  // buttons are reachable. A chameleon never held the lock, so this is a no-op for
  // them; a hunter usually lost it to Esc already, but not if something else
  // raised the menu.
  useEffect(() => {
    if (!paused) return;
    // Cancel first: `requestLock` keeps retrying for about two seconds, and a
    // retry landing after the menu opened would snatch the cursor back off it.
    cancelLock();
    document.exitPointerLock();
  }, [paused]);

  // Pause silences the room too. Without this a shot fired the instant before
  // Esc keeps ringing behind the menu.
  useEffect(() => {
    setAudioSuspended(paused);
  }, [paused]);

  // The whistle, for as long as a *chameleon* is alive in a session. It is *sent*,
  // not played: the room relays it back positioned at you, so it gives your
  // location away to anyone near enough to hear it. That is a cost only the
  // hidden should pay — a hunter who announced themselves every 45 seconds would
  // be handing the advantage to the people they are hunting.
  //
  // A converted chameleon stops whistling the moment their role flips, which is
  // handled by the role check itself — a hunter never gives their position away.
  useEffect(() => {
    if (!joined || role !== "chameleon" || dropped) return;
    const whistle = setInterval(sendWhistle, WHISTLE_INTERVAL_MS);
    return () => clearInterval(whistle);
  }, [joined, role, dropped]);

  /**
   * The one way into a room, whichever door was used: opening a lobby, joining
   * one by code, or reconnecting to one after a drop.
   *
   * `go` is the call that actually connects — the caller picks it, because that
   * is the only thing the three have different.
   */
  const enter = useCallback(
    (who: string, target: Session, go: () => Promise<RoomInfo>, what: string) => {
      // This runs from a button's click handler, which is the user gesture the
      // audio context has been waiting for. Unlocking anywhere else — an effect,
      // a timer — is silently refused and the whole game stays mute.
      unlockAudio();
      // Joining is a clean slate. Paint does not survive it — not yours, and not
      // the leftover skins of whoever was in the last session, whose session ids
      // will never be seen again.
      //
      // Being *moved* from a lobby into its match is not joining and does not
      // come through here: `net/client.ts` carries your paint across.
      forgetAllSkins();
      setBrush(DEFAULT_BRUSH);
      setError(null);
      setName(who);
      setJoined(true);
      setSession(target);
      // Nothing about the room we are leaving is true of the one we are opening,
      // and a stale `map` or `role` would be rendered for the round trip.
      setRoom(null);
      setPaused(false);
      setCaughtBy(null);
      setDropped(false);
      go()
        .then((info) => {
          setRoom(info);
          // The local slate was wiped above, and for three of the four doors the
          // server agrees by construction — a fresh seat has no strokes. A
          // *reconnection* is the exception: it reclaims the seat it left, so the
          // server is still holding paint this client has just thrown away, and
          // everyone else would go on seeing a body its owner cannot see. One
          // message keeps all three in step, and it is a no-op for the rest.
          sendClearSkin();
        })
        .catch((e: unknown) => {
          setError(
            `Could not ${what} on ${target.name} at ${target.host}:${target.gamePort}. ${
              e instanceof Error ? e.message : ""
            }`,
          );
        });
    },
    [],
  );

  const create = useCallback(
    (who: string, target: Session, wanted: string, listed: boolean, maxPlayers: number) =>
      enter(
        who,
        target,
        () => createLobby(who, target, wanted, listed, maxPlayers),
        "open a game",
      ),
    [enter],
  );

  const joinCode = useCallback(
    (who: string, target: Session, code: string) =>
      enter(who, target, () => joinLobby(who, target, code), `join ${code}`),
    [enter],
  );

  // Every later change to the room — the host starting the match, a new host,
  // a different map queued up, the clock — arrives as a patch rather than a
  // return value.
  useEffect(() => onRoom(setRoom), []);

  /**
   * One tick per second of a countdown, for everybody at once.
   *
   * **Driven off `timeLeft` changing rather than a timer of our own**, which is
   * what makes it the *server's* count that everyone hears: the number on screen
   * and the sound are the same event, so two players cannot tick out of step the
   * way two client-side timers would. Repeats are impossible for the same
   * reason — `onRoom` only fires when something actually differs.
   *
   * `ticking` is the set of phases that count down *to* something. A hunt has a
   * clock too, but a hundred seconds of ticking would be unbearable, so the last
   * ten are handled where that phase is built.
   */
  const secondsLeft = room?.timeLeft ?? 0;
  const phase = room?.phase;
  /**
   * Every second the game is counting something you can act on: the ten before a
   * round, the hiding phase, and the **closing stretch** of a hunt.
   *
   * Not the whole hunt — a hundred seconds of it is wearing, and a tick that
   * never stops stops meaning anything. It starts exactly where the clock turns
   * red, so the sound and the colour are one signal rather than two.
   */
  const ticking =
    phase === "countdown" ||
    phase === "hiding" ||
    (phase === "hunt" && secondsLeft <= HUNT_URGENT_SECONDS);
  useEffect(() => {
    if (!ticking || secondsLeft <= 0) return;
    playSound("tick");
  }, [ticking, secondsLeft]);

  /**
   * The bell and the gong, from the phase changing rather than from a message.
   *
   * The server does not broadcast either one. It does not need to: a phase is
   * already in state and already arrives at every client in the same patch, so
   * the transition *is* the announcement and there is no second thing to keep in
   * step with it. It also means no message type that would need a handler
   * registered — Colyseus warns about any that does not have one.
   *
   * Comparing against the previous phase is what makes it a transition and not a
   * state: somebody handed into a match that is already hunting has not just
   * heard a bell, and must not be played one. The ref starts empty, so the very
   * first phase anybody sees is silent.
   */
  const lastPhase = useRef<string | undefined>(undefined);
  /** The phase as of *now*, for anything scheduled to check before it fires. */
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = phase;
    if (!phase || !before || before === phase) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (phase === "hunt" && before === "hiding") {
      // Hiding is over and the hunter is on their way in.
      playSound("bell");
      /**
       * The music, once, a few seconds *under* the hunt rather than on top of
       * the bell — the bell is the one carrying information and the two landing
       * together buries it.
       *
       * `startLoop` with `once` rather than `playSound`, which sounds like the
       * wrong tool until you need to stop it: a `playSound` one-shot has no
       * handle, and this runs for seventy-six seconds — long enough to outlive a
       * round that ends early and carry on into the lobby. Registered as a loop,
       * `stopAllLoops` reaches it when the room changes.
       */
      /**
       * Anything already playing is stopped before the wait, not after it.
       *
       * `startLoop` refuses a second start while one is running, so it cannot
       * double up on its own — but that guard lives in one module instance, and
       * a hot reload leaves a second one holding its own `loops` map and its own
       * copy of whatever it started. Stopping first means the round always
       * begins from silence whatever the last one left behind.
       */
      stopLoop("ambient");
      timers.push(
        setTimeout(() => {
          // Checked at fire time, not at schedule time. The cleanup below covers
          // the ordinary case; this covers a call that outlived the code that
          // scheduled it, which is what a hot reload produces.
          if (phaseRef.current !== "hunt") return;
          startLoop("ambient", { once: true });
        }, MUSIC_DELAY_MS),
      );
    }

    // The round is decided, either way: three strikes, overlapping into one
    // long fall rather than three separate noises.
    if (phase === "reveal") {
      for (let i = 0; i < GONG_STRIKES; i++) {
        // Tapered: the strikes overlap and add, so a flat gain would make the
        // last one the loudest moment of the round rather than the first.
        const gain = GONG_FALLOFF ** i;
        if (i === 0) playSound("gong", { gain });
        else timers.push(setTimeout(() => playSound("gong", { gain }), i * GONG_GAP_MS));
      }
    }

    /**
     * Everything scheduled here is cancelled when the phase moves on.
     *
     * A round can end inside the music's five-second wait, and a client can
     * leave inside the gong's three strikes; either would otherwise fire into
     * whatever room they had reached by then.
     */
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /**
   * **A change of room is a clean slate.** This is the reset, and it is the only
   * one — anything added later that belongs to a room belongs here.
   *
   * `net/` fires `onLeftRoom` at each of the three places a room ends — a
   * hand-off, a deliberate exit, a dead socket — and always *before* the next
   * room is attached, so a listener can clear without racing the backlog the new
   * room is about to replay. Pressing Start therefore opens a match with nobody
   * painted, no shot marks and no graves, and coming home sixty seconds later
   * gives the same empty lobby back.
   *
   * What resets, and who does it:
   *
   * - **paint**, here — every body's, yours included (`forgetAllSkins`)
   * - **looping sounds**, here — the brush loop is the only one today, and a
   *   loop that outlives the room it started in is the bug this guards
   * - **marks and graves**, in `Scene.tsx`, which owns that state
   * - **remote players**, in `net/client.ts`, beside the event itself
   * - **the local body** — position, pose, camera, cling — via the `room` key on
   *   `<Player>`, which rebuilds it rather than clearing it
   *
   * The rule for anything new: if it is scoped to a room, it resets here or it
   * subscribes to `onLeftRoom` where it lives. Do not add a second mechanism.
   */
  useEffect(
    () =>
      onLeftRoom(() => {
        forgetAllSkins();
        stopAllLoops();
        setGraves([]);
      }),
    [],
  );

  // De-duplicated because the backlog and the live feed arrive through one
  // stream, and a reconnection can replay a grave this client already has.
  useEffect(
    () =>
      onGrave((grave) =>
        setGraves((prev) => (prev.some((g) => g.id === grave.id) ? prev : [...prev, grave])),
      ),
    [],
  );

  /**
   * Carried into a different room, which clears whatever was open over the old
   * one.
   *
   * Start is only clickable while paused — that is the one moment a hunter has a
   * cursor — so without this the host presses it and arrives in the match still
   * looking at a pause menu, offering to leave a match they have not seen yet.
   */
  useEffect(
    () =>
      onMoved(() => {
        setPaused(false);
        setPainting(false);
      }),
    [],
  );

  // A hand-off that left you behind. Whichever room you are in is still yours
  // to sit in, so this is a message and not an exit.
  useEffect(() => onMoveFailed((reason) => setError(`Could not change room. ${reason}`)), []);

  /**
   * The socket died.
   *
   * Everything that hands the cursor and the audio back belongs to a player who
   * is no longer connected to anything, so it is all torn down here — the same
   * teardown dying does, minus the disconnect, because there is nothing left to
   * disconnect from. Being shot raises its own screen and gets there first, so
   * it wins.
   */
  useEffect(
    () =>
      onDropped(() => {
        setDropped(true);
        setPainting(false);
        setPaused(false);
        cancelLock();
        stopAllLoops();
        document.exitPointerLock();
      }),
    [],
  );

  // Opening the panel hands the cursor back so you can draw. Closing it takes
  // nothing back here — clearing `painting` is enough, because the effect below
  // owns re-locking for every way into play, this one included.
  const setPaintOpen = useCallback((open: boolean) => {
    setPainting(open);
    if (!open) return;
    setPaused(false);
    cancelLock();
    document.exitPointerLock();
  }, []);

  // Opening the palette clears `paused`, so a hover arriving while the menu is
  // up would dismiss it. Player already stops reporting hovers when paused;
  // this is the second lock on the same door.
  const onHoverBody = useCallback(
    (hovering: boolean) => {
      if (pausedRef.current) return;
      if (hovering && !paintingRef.current) setPaintOpen(true);
    },
    [setPaintOpen],
  );

  const leave = useCallback(() => {
    cancelLock();
    stopAllLoops();
    void disconnect();
    setJoined(false);
    setSession(null);
    setRoom(null);
    setPaused(false);
    setPainting(false);
    setCaughtBy(null);
    setDropped(false);
  }, []);

  /**
   * What the pause menu's second button does, which is not the same thing in
   * both rooms.
   *
   * In a match it means "leave the match" and goes back to the waiting room the
   * match came from — you are still in that game, and its code still works. In
   * the waiting room there is nothing left to back out of, so it means the menu.
   */
  const quit = useCallback(() => {
    if (room?.mode === "match" && room.lobbyCode && session) {
      const { lobbyCode } = room;
      enter(name, session, () => joinLobby(name, session, lobbyCode), "return to the lobby");
      return;
    }
    leave();
  }, [enter, leave, name, room, session]);

  /**
   * You were caught. **You are not out** — you are a hunter now.
   *
   * Nothing here disconnects, and there is no death screen: the server flips
   * your role in place, and `role` arriving changed through `onRoom` is what
   * rebuilds your body at the spawn point. All this does is say so, briefly, and
   * close anything that belonged to being hidden — the palette above all, since
   * a hunter has no camouflage to paint and the server has just wiped it.
   */
  useEffect(() => {
    if (!joined) return;
    return onCaught((victimId, by) => {
      if (victimId !== selfId()) return;
      setCaughtBy(by);
      setPainting(false);
    });
  }, [joined]);

  // The notice is a moment, not a screen. It needs no reset on a room change:
  // the reveal alone is thirty seconds, so it has always expired long before
  // anybody reaches the next round, and it is hidden during the reveal anyway.
  useEffect(() => {
    if (!caughtBy) return;
    const t = setTimeout(() => setCaughtBy(null), 3500);
    return () => clearTimeout(t);
  }, [caughtBy]);


  const resume = useCallback(() => {
    setPaused(false);
    // The effect below takes the lock back; this only clears the menu.
  }, []);

  /**
   * A hunter aims with the mouse, so they hold the pointer for as long as they
   * are actually playing — not just after Resume.
   *
   * Driving it from state rather than from each button means every way back into
   * play is covered by one rule: joining, resuming, closing the palette,
   * respawning. `requestLock` retries for about two seconds, which carries it
   * through the browser's post-Esc cooldown and lands inside the transient
   * activation left by whichever click got us here.
   *
   * Every state this guards against is one where the cursor is deliberately
   * loose, and each of those calls `cancelLock` as it begins.
   */
  useEffect(() => {
    if (!joined) return;

    /**
     * **A chameleon must be made to let go, not merely never asked to take.**
     *
     * Everybody waits in the lobby as a hunter, so a player carried into a match
     * as a chameleon *arrives already holding the lock* — the browser's lock is
     * on the canvas and the canvas outlives the trip. Nothing here used to
     * release it, so they had no cursor (no palette, no right-drag to look
     * around) and the only way out was Esc, which drops the lock and raises the
     * pause menu: the "pause and un-pause and then it works" symptom, arriving
     * from the opposite direction to the hunter's.
     */
    if (role !== "hunter") {
      cancelLock();
      document.exitPointerLock();
      return;
    }

    if (paused || painting || dropped) return;
    requestLock();
  }, [joined, role, paused, painting, dropped]);

  // Back into the seat the server is still holding, if it still is — and a plain
  // re-join of the same room if it is not.
  const reconnect = useCallback(() => {
    if (!session || !room) return;
    const { code } = room;
    enter(name, session, () => rejoin(name, session, code), "reconnect");
  }, [enter, name, room, session]);

  /**
   * Esc opens the pause menu. It deliberately cannot close it.
   *
   * Leaving is a click on Resume, and that is a rule about the pointer lock, not
   * about menus. Esc is *how the lock is released*, and the browser then refuses
   * to hand it back for about a second — so resuming with the same key asked for
   * it milliseconds after giving it up, which Chrome answers with a
   * SecurityError and the dev overlay paints over the game as a crash. A click
   * on Resume is a fresh gesture, far enough after the release to be granted.
   *
   * A chameleon has no lock to lose, so their Esc is read here directly. A hunter's
   * is swallowed by the browser while the lock is held — losing the lock is what
   * raises the menu — and once the menu is up their Esc reaches us and is
   * ignored, like everyone else's.
   */
  useEffect(() => {
    if (!joined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || dropped) return;
      if (paintingRef.current) setPaintOpen(false);
      else if (!pausedRef.current && role === "chameleon") setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, role, dropped, setPaintOpen]);

  // For a hunter, Esc releases the pointer lock rather than reaching the app,
  // so losing the lock is what actually means "the player wants out".
  useEffect(() => {
    if (!joined || role !== "hunter" || dropped) return;
    /**
     * Whether this hunter has ever actually held the lock.
     *
     * **Losing a lock means "the player wants out"; never having had one does
     * not.** A chameleon who is caught becomes a hunter without clicking
     * anything, so `requestPointerLock` has no user gesture to spend and is
     * refused — and any `pointerlockchange` arriving in that state used to be
     * read as Esc and pause the game. That is the "you respawn with a gun but
     * cannot move" bug: paused, with no menu gesture that obviously un-pauses
     * it. Until the lock has been held once, its absence is just the ordinary
     * state of a player who has not clicked yet.
     */
    let held = document.pointerLockElement === lockTargetEl();
    const onLockChange = () => {
      if (document.pointerLockElement) {
        held = true;
        setPaused(false);
        return;
      }
      if (held && !paintingRef.current) setPaused(true);
      held = false;
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, [joined, role, dropped]);

  useEffect(() => {
    return () => {
      stopAllLoops();
      void disconnect();
    };
  }, []);

  // The Canvas stays mounted and the menu sits over it, so creating or joining a
  // game drops you straight into the room instead of swapping out the whole tree.
  return (
    <div className="relative h-dvh w-full">
      <Scene
        map={room?.map ?? DEFAULT_MAP}
        // The player is keyed on this, so crossing between a lobby and its
        // match rebuilds them at the spawn point rather than carrying the pose
        // and position of the game that just ended.
        room={room?.code ?? ""}
        role={room ? role : null}
        reveal={room?.phase === "reveal"}
        hunting={room?.phase === "hunt"}
        // The survivors are the exhibit, so they hold their spot while everyone
        // else walks over to look at it. They keep their camera.
        frozen={rooted}
        graves={graves}
        painting={painting}
        // A dropped player's input goes nowhere. The reveal is *not* in here:
        // the round is decided but everyone keeps walking, which is how you go
        // and look at the spot that beat you.
        paused={paused || dropped}
        brush={brush}
        onHoverBody={onHoverBody}
      />
      {joined ? (
        <>
          <ControlsPanel role={role} />
          {/* Sides are secret until they exist. Everyone waiting in a lobby is
              nominally a hunter — that is what `onJoin` sets — so labelling the
              rows before the draw would print "hunter" beside every name and
              read as a spoiler of something that has not happened. */}
          <PlayerList
            name={name}
            role={role}
            showRoles={room ? room.phase !== "waiting" && room.phase !== "countdown" : false}
          />
          {room && !dropped && room.phase !== "reveal" && (
            <PhaseBanner phase={room.phase} seconds={room.timeLeft} role={role} />
          )}
          {/* Deliberately *not* hidden while paused. Everyone in the waiting
              room is a hunter, so everyone holds the pointer lock and nobody has
              a cursor; pausing is what hands it back, and it is therefore the
              only moment Start and the map buttons can be clicked at all. */}
          {room?.mode === "lobby" && !dropped && (
            <LobbyPanel
              code={room.code}
              nextMap={room.nextMap}
              isHost={room.isHost}
              isListed={room.isListed}
              phase={room.phase}
              timeLeft={room.timeLeft}
              players={room.playerCount}
              maxPlayers={room.maxPlayers}
            />
          )}
          {/* A hunter has nothing to camouflage, and the server wipes their
              paint the moment they are caught — so the palette belongs to
              chameleons and to the waiting room, where everybody is still one
              button press from being either. */}
          {!paused && !dropped && !rooted && role === "chameleon" && (
            <PaintPanel
              open={painting}
              onOpenChange={setPaintOpen}
              brush={brush}
              onBrush={setBrush}
              onClear={() => {
                clearSkin(SELF);
                sendClearSkin();
              }}
            />
          )}
          {role === "hunter" && !paused && !painting && !dropped && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70" />
          )}
          {paused && !painting && !dropped && (
            <PauseMenu
              sessionName={session?.name ?? "session"}
              mode={room?.mode ?? "lobby"}
              onResume={resume}
              onLeave={quit}
            />
          )}
          {dropped && <DroppedPanel onReconnect={reconnect} onExit={leave} />}
          {/* The round is decided. Everything above is still rendered behind
              this — the world, the bodies, the graves — because seeing where
              people were is the whole point of the thirty seconds. */}
          {room?.phase === "reveal" && !dropped && (
            <RoundOverPanel
              winner={room.winner}
              role={role}
              seconds={room.timeLeft}
              graves={graves}
            />
          )}
          {caughtBy && room?.phase !== "reveal" && (
            <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-lg border border-rose-500/60 bg-rose-950/85 px-5 py-3 text-center">
              <div className="text-sm font-semibold tracking-wide text-rose-200">
                Caught by {caughtBy}
              </div>
              <div className="mt-0.5 text-[11px] text-rose-300/80">
                You are a hunter now — go and find the rest.
              </div>
            </div>
          )}
          {error && (
            <div className="absolute bottom-4 left-1/2 max-w-lg -translate-x-1/2 rounded-md border border-amber-600/60 bg-amber-950/80 px-4 py-2 text-center text-xs text-amber-200">
              {error}
            </div>
          )}
        </>
      ) : (
        <StartMenu onCreate={create} onJoinCode={joinCode} />
      )}
    </div>
  );
}

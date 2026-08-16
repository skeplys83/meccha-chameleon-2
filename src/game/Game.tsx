import { useCallback, useEffect, useRef, useState } from "react";
import { StartMenu } from "@/game/hud/StartMenu";
import { ControlsPanel } from "@/game/hud/ControlsPanel";
import { PlayerList } from "@/game/hud/PlayerList";
import { PauseMenu } from "@/game/hud/PauseMenu";
import { PaintPanel } from "@/game/paint/PaintPanel";
import { DEFAULT_BRUSH, type Brush } from "@/game/paint/brush";
import { DEFAULT_MAP } from "@/game/world/mapIds";
import { preloadMap } from "@/game/world/preload";
import { preloadCharacter } from "@/game/figure/model";
import { LoadingScreen } from "@/game/hud/LoadingScreen";
import { beginLoading, useLoading } from "@/game/loading";
import { LobbyPanel } from "@/game/hud/LobbyPanel";
import { DroppedPanel } from "@/game/hud/DroppedPanel";
import { PhaseBanner } from "@/game/hud/PhaseBanner";
import { RoundOverPanel } from "@/game/hud/RoundOverPanel";
import { DebugPanel } from "@/game/hud/DebugPanel";
import { DEV, clearPlayerDebug, toggleDevMode } from "@/game/dev";
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
} from "@/game/net";
import { clearSkin, forgetAllSkins, SELF } from "@/game/paint/skin";
import { cancelLock, lockTargetEl, requestLock } from "@/game/players/pointerLock";
import {
  playSound,
  preloadMusic,
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
  const [paused, setPaused] = useState(false);
  // `painting` means the palette is up. Hovering your own body opens it, and
  // from then on it stays open until it is minimised — a palette that closed
  // itself while you were mixing a colour would be maddening.
  const [painting, setPainting] = useState(false);
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  /** The eyedropper is armed: the next click in the world takes its colour. */
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("player");
  /** Who caught you, for the few seconds the notice is up. */
  const [caughtBy, setCaughtBy] = useState<string | null>(null);
  /** The connection died on its own. Distinct from every deliberate exit, and
   *  the only state where the game on screen is not connected to anything. */
  const [dropped, setDropped] = useState(false);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  /** Where each chameleon was found this round. See invariant 4. */
  const [graves, setGraves] = useState<Grave[]>([]);
  /** Which side you are on, read off the room rather than chosen. */
  const role: Role = room?.role ?? "chameleon";
  /** Rooted where you are, camera free. */
  const rooted = room?.phase === "reveal" && role === "chameleon";
  const loading = useLoading();

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

  /** Losing the window pauses the game, whoever you are. See invariant 1. */
  useEffect(() => {
    if (!joined) return;
    // Closing the palette matters as much as pausing. `painting` and `paused`
    // are mutually exclusive everywhere else — opening the palette clears the
    // pause — and this was the one path that set one without the other. The
    // result hid *both* the panel and the menu while the keys stayed dead, so a
    // chameleon came back to a game that ignored them until they pressed Esc to
    // shut the palette and only then found something to resume.
    const away = () => {
      setPaused(true);
      setPainting(false);
    };
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

  /** The whistle, for as long as a *chameleon* is alive in a session. */
  useEffect(() => {
    if (!joined || role !== "chameleon" || dropped) return;
    const whistle = setInterval(sendWhistle, WHISTLE_INTERVAL_MS);
    return () => clearInterval(whistle);
  }, [joined, role, dropped]);

  const enter = useCallback(
    (who: string, go: () => Promise<RoomInfo>, what: string) => {
      // This runs from a button's click handler, which is the user gesture the
      // audio context has been waiting for. Unlocking anywhere else — an effect,
      // a timer — is silently refused and the whole game stays mute.
      unlockAudio();
      // The body everyone wears, 124 KB. Nothing renders a figure before this
      // click, and `StickFigure` draws nothing until it lands rather than
      // suspending — suspending there would tear down the collider it sits in.
      void preloadCharacter();
      // Joining is a clean slate.
      forgetAllSkins();
      setBrush(DEFAULT_BRUSH);
      setPicking(false);
      setError(null);
      setName(who);
      setJoined(true);
      // Nothing about the room we are leaving is true of the one we are opening,
      // and a stale `map` or `role` would be rendered for the round trip.
      setRoom(null);
      setPaused(false);
      setCaughtBy(null);
      setDropped(false);
      // Connecting is the other thing worth waiting on, and until now it showed
      // nothing: `joined` flips instantly, `room` arrives a few hundred ms later,
      // and in between the menu is gone and the world is an empty arena nobody
      // is in yet. It ends on the room *or* on the error — never left hanging.
      const arrived = beginLoading();
      go()
        .then((info) => {
          setRoom(info);
          sendClearSkin();
        })
        .catch((e: unknown) => {
          setError(
            `Could not ${what}. ${e instanceof Error ? e.message : ""}`,
          );
        })
        .finally(arrived);
    },
    [],
  );

  const create = useCallback(
    (who: string, wanted: string, listed: boolean, maxPlayers: number) =>
      enter(
        who,
        () => createLobby(who, wanted, listed, maxPlayers),
        "open a game",
      ),
    [enter],
  );

  const joinCode = useCallback(
    (who: string, code: string) =>
      enter(who, () => joinLobby(who, code), `join ${code}`),
    [enter],
  );

  // Every later change to the room — the host starting the match, a new host,
  // a different map queued up, the clock — arrives as a patch rather than a
  // return value.
  useEffect(() => onRoom(setRoom), []);

  const nextMap = room?.nextMap;
  const counting = room?.phase === "countdown";
  useEffect(() => {
    if (!nextMap) return;
    preloadMap(nextMap);
    void preloadMusic();
  }, [nextMap, counting]);

  /** One tick per second of a countdown, for everybody at once. */
  const secondsLeft = room?.timeLeft ?? 0;
  const phase = room?.phase;
  const ticking =
    phase === "countdown" ||
    phase === "hiding" ||
    (phase === "hunt" && secondsLeft <= HUNT_URGENT_SECONDS);
  useEffect(() => {
    if (!ticking || secondsLeft <= 0) return;
    playSound("tick");
  }, [ticking, secondsLeft]);

  /** The bell and the gong, from the phase changing rather than from a message. */
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
      /** Anything already playing is stopped before the wait, not after it. */
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

    /** Everything scheduled here is cancelled when the phase moves on. */
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /** A change of room is a clean slate. */
  useEffect(
    () =>
      onLeftRoom(() => {
        forgetAllSkins();
        stopAllLoops();
        setGraves([]);
        clearPlayerDebug();
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

  /** Carried into a different room, which clears whatever was open over the old one. */
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

  /** The socket died. */
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
    setRoom(null);
    setPaused(false);
    setPainting(false);
    setCaughtBy(null);
    setDropped(false);
  }, []);

  /** What the pause menu's second button does, which is not the same thing in both rooms. */
  const quit = useCallback(() => {
    if (room?.mode === "match" && room.lobbyCode) {
      const { lobbyCode } = room;
      enter(name, () => joinLobby(name, lobbyCode), "return to the lobby");
      return;
    }
    leave();
  }, [enter, leave, name, room]);

  /** You were caught. */
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

  useEffect(() => {
    if (!joined) return;

    /** A chameleon must be made to let go, not merely never asked to take. */
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
    if (!room) return;
    const { code } = room;
    enter(name, () => rejoin(name, code), "reconnect");
  }, [enter, name, room]);

  /**
   * Esc opens the pause menu, and closes it again — but only for a chameleon,
   * and only while this document really holds focus.
   *
   * **Both halves of that are the pointer lock.** A hunter's Esc never reaches
   * here at all: the browser spends it releasing the lock, and `pointerlockchange`
   * is what raises their menu. Were it to reach here, resuming would ask for the
   * lock back in the same keypress that just gave it up, which the browser
   * refuses — so Esc would close the menu and leave them looking around with no
   * lock and no way back. A chameleon never holds one, so for them the key is
   * free to work both ways.
   *
   * `hasFocus` is the "with the mouse" half: a pause that came from losing the
   * window should be dismissed by coming *back* to it, not by a keystroke that
   * arrives while the page is still in the background.
   */
  useEffect(() => {
    if (!joined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || dropped) return;
      if (paintingRef.current) {
        setPaintOpen(false);
        return;
      }
      if (role !== "chameleon") return;
      if (!pausedRef.current) setPaused(true);
      else if (document.hasFocus()) setPaused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, role, dropped, setPaintOpen]);

  // For a hunter, Esc releases the pointer lock rather than reaching the app,
  // so losing the lock is what actually means "the player wants out".
  useEffect(() => {
    if (!joined || role !== "hunter" || dropped) return;
    /** Whether this hunter has ever actually held the lock. */
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

  // Developer mode's keyboard half. The chip in the readout is the visible
  // toggle; this is here because a hunter holds the pointer lock and cannot
  // click anything, and because backquote is bound to nothing in
  // `players/controls.ts`. Compiled out of the build with the rest of it.
  useEffect(() => {
    if (!DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Backquote" || e.metaKey || e.ctrlKey || e.altKey) return;
      // Not while somebody is typing their name into the menu.
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      toggleDevMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
        onBrush={setBrush}
        picking={picking}
        onPicked={(hex) => {
          setBrush((b) => ({ ...b, color: hex }));
          setPicking(false);
        }}
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
              picking={picking}
              onPickingChange={setPicking}
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
              sessionName={room?.code ? `Game ${room.code}` : "Super Chameleon"}
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
      {/* Last, and over everything including the menu, because it is the one
          overlay that is not about the game: while it is up there is no floor
          under the player and nothing behind it worth seeing. It cannot appear
          on the start menu — the arena downloads nothing and never suspends. */}
      {/* Developer mode only, and compiled out of the build — see
          `src/game/dev.ts`. Over the panels, because it is scaffolding rather
          than part of the game, and pinned to the one corner nothing else uses.
          Mounted whether or not the mode is *on*: the chip inside it is the
          toggle, and a switch that vanishes when you use it is a trap. */}
      {DEV && joined && <DebugPanel map={room?.map ?? DEFAULT_MAP} phase={room?.phase ?? "—"} />}
      {loading && <LoadingScreen />}
    </div>
  );
}

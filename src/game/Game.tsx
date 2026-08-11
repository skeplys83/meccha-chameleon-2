"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { StartMenu } from "@/game/hud/StartMenu";
import { ControlsPanel } from "@/game/hud/ControlsPanel";
import { PlayerList } from "@/game/hud/PlayerList";
import { PauseMenu } from "@/game/hud/PauseMenu";
import { PaintPanel } from "@/game/paint/PaintPanel";
import { DEFAULT_BRUSH, type Brush } from "@/game/paint/brush";
import { DEFAULT_MAP } from "@/game/world/mapIds";
import { DeathScreen } from "@/game/hud/DeathScreen";
import { LobbyPanel } from "@/game/hud/LobbyPanel";
import { DroppedPanel } from "@/game/hud/DroppedPanel";
import { MatchClock } from "@/game/hud/MatchClock";
import {
  createLobby,
  disconnect,
  joinLobby,
  onDropped,
  onKilled,
  onMoved,
  onMoveFailed,
  onRoom,
  rejoin,
  selfId,
  sendClearSkin,
  sendWhistle,
  type RoomInfo,
  type Session,
} from "@/game/net";
import { clearSkin, forgetAllSkins, SELF } from "@/game/paint/skin";
import { cancelLock, requestLock } from "@/game/players/pointerLock";
import { setAudioSuspended, stopAllLoops, unlockAudio } from "@/game/sound/engine";
import { WHISTLE_INTERVAL_MS } from "@/game/shared/protocol";
import type { Role } from "@/game/shared/protocol";

// The renderer touches WebGL/window, so it must never run on the server.
const Scene = dynamic(() => import("./Scene"), { ssr: false });

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
  const [killedBy, setKilledBy] = useState<string | null>(null);
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
   * Which side you are on, read off the room rather than chosen.
   *
   * Nobody picks: everyone waits in the lobby as a seeker, and the draw at Start
   * turns all but one of them into hiders. So this flips underneath the player
   * at the moment they arrive in the match. Every effect below keyed on it — the
   * pointer lock, the whistle, the legend, the viewmodel — re-runs then, which is
   * exactly right.
   *
   * The fallback matters, and used to be visible. `joined` flips the instant the
   * button is clicked while `room` only arrives when the connection settles, so
   * anything keyed on `joined` gets `"hider"` for those few hundred milliseconds
   * — which spawned you into the waiting room as a small third-person figure
   * before snapping to the seeker's first-person camera. `Scene` is keyed on
   * `room` instead, so nobody is drawn until the room has said which side you
   * are on.
   */
  const role: Role = room?.role ?? "hider";
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

  // Pausing always hands the cursor back, whichever role you are, so the menu
  // buttons are reachable. A hider never held the lock, so this is a no-op for
  // them; a seeker usually lost it to Esc already, but not if something else
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

  // The whistle, for as long as a *hider* is alive in a session. It is *sent*,
  // not played: the room relays it back positioned at you, so it gives your
  // location away to anyone near enough to hear it. That is a cost only the
  // hidden should pay — a seeker who announced themselves every 45 seconds would
  // be handing the advantage to the people they are hunting.
  //
  // `killedBy` is in the deps on purpose. A dead player is out of the room, and a
  // corpse that keeps whistling is both wrong and impossible to explain.
  useEffect(() => {
    if (!joined || role !== "hider" || killedBy || dropped) return;
    const whistle = setInterval(sendWhistle, WHISTLE_INTERVAL_MS);
    return () => clearInterval(whistle);
  }, [joined, role, killedBy, dropped]);

  /**
   * The one way into a room, whichever door was used: opening a lobby, joining
   * one by code, or respawning back into a match.
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
      // will never be seen again. A respawn goes through here too, so dying costs
      // you your paint job as well.
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
      setKilledBy(null);
      setDropped(false);
      go()
        .then(setRoom)
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
    (who: string, target: Session, wanted: string, listed: boolean) =>
      enter(who, target, () => createLobby(who, target, wanted, listed), "open a game"),
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
   * Carried into a different room, which clears whatever was open over the old
   * one.
   *
   * Start is only clickable while paused — that is the one moment a seeker has a
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
    setKilledBy(null);
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

  // Being shot drops you out of the room, so the death screen is the only
  // thing left holding the session details for a respawn.
  useEffect(() => {
    if (!joined) return;
    return onKilled((victimId, by) => {
      if (victimId !== selfId()) return;
      setKilledBy(by);
      setPainting(false);
      setPaused(false);
      document.exitPointerLock();
      // Anything still running belongs to a player who no longer exists — the
      // brush loop above all, which would otherwise scrub away behind the death
      // screen. One-shots already in flight are allowed to finish; the squash
      // that killed you is one of them.
      cancelLock();
      stopAllLoops();
      void disconnect();
    });
  }, [joined]);

  const resume = useCallback(() => {
    setPaused(false);
    // The effect below takes the lock back; this only clears the menu.
  }, []);

  /**
   * A seeker aims with the mouse, so they hold the pointer for as long as they
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
    if (!joined || role !== "seeker" || paused || painting || killedBy || dropped) return;
    requestLock();
  }, [joined, role, paused, painting, killedBy, dropped]);

  // Being shot drops you out of the room entirely, so a respawn is a plain
  // re-join of the same one — by id, which for a match is the only way in.
  // Being shot drops you out of the room, so a respawn is a re-join of the same
  // one. No role goes out with it: the server refuses to take one from a client,
  // and the only player who ever needs this is a dead hider.
  const respawn = useCallback(() => {
    if (!session || !room) return;
    const { code } = room;
    enter(name, session, () => rejoin(name, session, code), "rejoin");
  }, [enter, name, room, session]);

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
   * SecurityError and Next paints over the game as a crash. A click on Resume is
   * a fresh gesture, far enough after the release to be granted.
   *
   * A hider has no lock to lose, so their Esc is read here directly. A seeker's
   * is swallowed by the browser while the lock is held — losing the lock is what
   * raises the menu — and once the menu is up their Esc reaches us and is
   * ignored, like everyone else's.
   */
  useEffect(() => {
    if (!joined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || killedBy || dropped) return;
      if (paintingRef.current) setPaintOpen(false);
      else if (!pausedRef.current && role === "hider") setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, role, killedBy, dropped, setPaintOpen]);

  // For a seeker, Esc releases the pointer lock rather than reaching the app,
  // so losing the lock is what actually means "the player wants out".
  useEffect(() => {
    if (!joined || role !== "seeker" || dropped) return;
    const onLockChange = () => {
      if (!document.pointerLockElement) {
        if (!paintingRef.current) setPaused(true);
      } else setPaused(false);
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
        role={room ? role : null}
        alive={!killedBy}
        painting={painting}
        // A dropped player's input goes nowhere, so the world stops taking it.
        paused={paused || dropped}
        brush={brush}
        onHoverBody={onHoverBody}
      />
      {joined ? (
        <>
          <ControlsPanel role={role} />
          <PlayerList name={name} role={role} />
          {room?.mode === "match" && !killedBy && !dropped && (
            <MatchClock seconds={room.timeLeft} />
          )}
          {/* Deliberately *not* hidden while paused. Everyone in the waiting
              room is a seeker, so everyone holds the pointer lock and nobody has
              a cursor; pausing is what hands it back, and it is therefore the
              only moment Start and the map buttons can be clicked at all. */}
          {room?.mode === "lobby" && !killedBy && !dropped && (
            <LobbyPanel
              code={room.code}
              nextMap={room.nextMap}
              isHost={room.isHost}
              isListed={room.isListed}
            />
          )}
          {!paused && !killedBy && !dropped && (
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
          {role === "seeker" && !paused && !painting && !killedBy && !dropped && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70" />
          )}
          {paused && !painting && !killedBy && !dropped && (
            <PauseMenu
              sessionName={session?.name ?? "session"}
              mode={room?.mode ?? "lobby"}
              onResume={resume}
              onLeave={quit}
            />
          )}
          {/* A drop beats everything except a death, which raised its own
              screen before the socket ever went. */}
          {dropped && !killedBy && (
            <DroppedPanel onReconnect={reconnect} onExit={leave} />
          )}
          {killedBy && (
            <DeathScreen
              by={killedBy}
              sessionName={session?.name ?? "session"}
              onRespawn={respawn}
              onExit={leave}
            />
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

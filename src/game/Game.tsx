"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoleMenu } from "@/game/hud/RoleMenu";
import { ControlsPanel } from "@/game/hud/ControlsPanel";
import { PlayerList } from "@/game/hud/PlayerList";
import { PauseMenu } from "@/game/hud/PauseMenu";
import { PaintPanel } from "@/game/paint/PaintPanel";
import { DEFAULT_BRUSH, type Brush } from "@/game/paint/brush";
import { DEFAULT_MAP } from "@/game/world/mapIds";
import { DeathScreen } from "@/game/hud/DeathScreen";
import {
  connect,
  disconnect,
  onKilled,
  selfId,
  sendClearSkin,
  sendWhistle,
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
  const [role, setRole] = useState<Role | null>(null);
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
  /** The map the room settled on, which need not be the one that was asked for
   *  — you only get your choice if you are the one who opened the room. */
  const [map, setMap] = useState<string>(DEFAULT_MAP);
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
    if (role !== "hider" || !session || killedBy) return;
    const whistle = setInterval(sendWhistle, WHISTLE_INTERVAL_MS);
    return () => clearInterval(whistle);
  }, [role, session, killedBy]);

  const join = useCallback(
    (who: string, picked: Role, target: Session, wanted: string) => {
    // This runs from the role button's click handler, which is the user gesture
    // the audio context has been waiting for. Unlocking anywhere else — an
    // effect, a timer — is silently refused and the whole game stays mute.
    unlockAudio();
    // Joining is a clean slate. Paint does not survive it — not yours, and not
    // the leftover skins of whoever was in the last session, whose session ids
    // will never be seen again. A respawn goes through here too, so dying costs
    // you your paint job as well.
    forgetAllSkins();
    setBrush(DEFAULT_BRUSH);
    setError(null);
    setName(who);
    setRole(picked);
    setSession(target);
    setPaused(false);
    setKilledBy(null);
      connect(who, picked, target, wanted)
        .then((room) => {
          setMap((room.state as unknown as { map?: string }).map ?? DEFAULT_MAP);
        })
        .catch((e: unknown) => {
          setError(
            `Could not reach ${target.name} at ${target.host}:${target.gamePort}. ${
              e instanceof Error ? e.message : ""
            }`,
          );
        });
    },
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
    setRole(null);
    setSession(null);
    setPaused(false);
    setPainting(false);
    setKilledBy(null);
  }, []);

  // Being shot drops you out of the room, so the death screen is the only
  // thing left holding the session details for a respawn.
  useEffect(() => {
    if (!role) return;
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
  }, [role]);

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
    if (role !== "seeker" || paused || painting || killedBy) return;
    requestLock();
  }, [role, paused, painting, killedBy]);

  const respawn = useCallback(() => {
    if (!role || !session) return;
    setKilledBy(null);
    join(name, role, session, map);
  }, [join, map, name, role, session]);

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
    if (!role) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || killedBy) return;
      if (paintingRef.current) setPaintOpen(false);
      else if (!pausedRef.current && role === "hider") setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role, killedBy, setPaintOpen]);

  // For a seeker, Esc releases the pointer lock rather than reaching the app,
  // so losing the lock is what actually means "the player wants out".
  useEffect(() => {
    if (role !== "seeker") return;
    const onLockChange = () => {
      if (!document.pointerLockElement) {
        if (!paintingRef.current) setPaused(true);
      } else setPaused(false);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, [role]);

  useEffect(() => {
    return () => {
      stopAllLoops();
      void disconnect();
    };
  }, []);

  // The Canvas stays mounted and the menu sits over it, so picking a role drops
  // you straight into the room instead of swapping out the whole tree.
  return (
    <div className="relative h-dvh w-full">
      <Scene
        map={map}
        role={role}
        alive={!killedBy}
        painting={painting}
        paused={paused}
        brush={brush}
        onHoverBody={onHoverBody}
      />
      {role ? (
        <>
          <ControlsPanel role={role} />
          <PlayerList />
          {!paused && !killedBy && (
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
          {role === "seeker" && !paused && !painting && !killedBy && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70" />
          )}
          {paused && !painting && !killedBy && (
            <PauseMenu
              sessionName={session?.name ?? "session"}
              onResume={resume}
              onLeave={leave}
            />
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
        <RoleMenu onJoin={join} />
      )}
    </div>
  );
}

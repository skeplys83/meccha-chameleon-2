"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoleMenu } from "@/game/hud/RoleMenu";
import { ControlsPanel } from "@/game/hud/ControlsPanel";
import { PlayerList } from "@/game/hud/PlayerList";
import { PauseMenu } from "@/game/hud/PauseMenu";
import { PaintPanel } from "@/game/paint/PaintPanel";
import { DEFAULT_BRUSH, type Brush } from "@/game/paint/brush";
import { DeathScreen } from "@/game/hud/DeathScreen";
import {
  connect,
  disconnect,
  onKilled,
  selfId,
  sendClearSkin,
  type Session,
} from "@/game/net";
import { clearSkin, SELF } from "@/game/paint/skin";
import { requestLock } from "@/game/players/pointerLock";
import { setAudioSuspended, unlockAudio } from "@/game/sound/engine";
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
    if (paused) document.exitPointerLock();
  }, [paused]);

  // Pause silences the room too. Without this a shot fired the instant before
  // Esc keeps ringing behind the menu.
  useEffect(() => {
    setAudioSuspended(paused);
  }, [paused]);

  const join = useCallback((who: string, picked: Role, target: Session) => {
    // This runs from the role button's click handler, which is the user gesture
    // the audio context has been waiting for. Unlocking anywhere else — an
    // effect, a timer — is silently refused and the whole game stays mute.
    unlockAudio();
    setError(null);
    setName(who);
    setRole(picked);
    setSession(target);
    setPaused(false);
    setKilledBy(null);
    connect(who, picked, target).catch((e: unknown) => {
      setError(
        `Could not reach ${target.name} at ${target.host}:${target.gamePort}. ${
          e instanceof Error ? e.message : ""
        }`,
      );
    });
  }, []);

  // Opening the panel hands the cursor back so you can draw; collapsing it
  // re-locks the pointer for normal play.
  const setPaintOpen = useCallback(
    (open: boolean) => {
      setPainting(open);
      if (open) {
        setPaused(false);
        document.exitPointerLock();
      } else if (role === "seeker") {
        // Hiders never hold the lock, so there is nothing to take back.
        requestLock();
      }
    },
    [role],
  );

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
      void disconnect();
    });
  }, [role]);

  const resume = useCallback(() => {
    setPaused(false);
    if (role === "seeker") requestLock();
  }, [role]);

  const respawn = useCallback(() => {
    if (!role || !session) return;
    setKilledBy(null);
    join(name, role, session);
  }, [join, name, role, session]);

  // A hider has no pointer lock to lose, so their Esc has to be read directly.
  // A seeker's Esc is swallowed by the browser while the lock is held — losing
  // the lock is what raises the menu (below) — but once the menu is up their
  // cursor is free and Esc reaches us like anyone else's, so it can close it.
  useEffect(() => {
    if (!role) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || killedBy) return;
      if (paintingRef.current) setPaintOpen(false);
      else if (pausedRef.current) resume();
      else if (role === "hider") setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role, killedBy, resume, setPaintOpen]);

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
      void disconnect();
    };
  }, []);

  // The Canvas stays mounted and the menu sits over it, so picking a role drops
  // you straight into the room instead of swapping out the whole tree.
  return (
    <div className="relative h-dvh w-full">
      <Scene
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

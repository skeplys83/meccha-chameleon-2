"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { RoleMenu } from "./RoleMenu";
import { ControlsPanel } from "./ControlsPanel";
import { PlayerList } from "./PlayerList";
import { PauseMenu } from "./PauseMenu";
import { connect, disconnect, type Session } from "@/lib/net";
import { requestLock } from "@/lib/pointerLock";
import type { Role } from "./types";

// The renderer touches WebGL/window, so it must never run on the server.
const Scene = dynamic(() => import("./Scene"), { ssr: false });

export function Game() {
  const [role, setRole] = useState<Role | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = useCallback((name: string, picked: Role, target: Session) => {
    setError(null);
    setRole(picked);
    setSession(target);
    setPaused(false);
    connect(name, picked, target).catch((e: unknown) => {
      setError(
        `Could not reach ${target.name} at ${target.host}:${target.gamePort}. ${
          e instanceof Error ? e.message : ""
        }`,
      );
    });
  }, []);

  const leave = useCallback(() => {
    void disconnect();
    setRole(null);
    setSession(null);
    setPaused(false);
  }, []);

  // Esc releases the pointer lock rather than reaching the app, so losing the
  // lock is what actually means "the player wants out".
  useEffect(() => {
    if (!role) return;
    const onLockChange = () => {
      if (!document.pointerLockElement) setPaused(true);
      else setPaused(false);
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
      <Scene role={role} />
      {role ? (
        <>
          <ControlsPanel role={role} />
          <PlayerList />
          {role === "seeker" && !paused && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70" />
          )}
          {paused && (
            <PauseMenu
              sessionName={session?.name ?? "session"}
              onResume={requestLock}
              onLeave={leave}
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

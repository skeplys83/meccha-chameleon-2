"use client";

import { Client, getStateCallbacks, type Room } from "colyseus.js";
import type { Role } from "@/components/game/types";

export type RemoteTarget = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flat: boolean;
};

export type Remote = {
  id: string;
  name: string;
  role: Role;
  target: RemoteTarget;
};

export type NetMark = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

export type Session = {
  id: string;
  name: string;
  host: string;
  port: number;
  gamePort: number;
};

/**
 * Live transforms for everyone else, mutated in place as Colyseus patches
 * arrive. Deliberately outside React: re-rendering the tree twenty times a
 * second is what makes naive multiplayer stutter.
 */
export const remotes = new Map<string, Remote>();

let room: Room | null = null;

const rosterListeners = new Set<(ids: string[]) => void>();
const markListeners = new Set<(mark: NetMark) => void>();

export function onRoster(fn: (ids: string[]) => void) {
  rosterListeners.add(fn);
  return () => {
    rosterListeners.delete(fn);
  };
}

export function onMark(fn: (mark: NetMark) => void) {
  markListeners.add(fn);
  return () => {
    markListeners.delete(fn);
  };
}

function emitRoster() {
  const ids = [...remotes.keys()];
  rosterListeners.forEach((fn) => fn(ids));
}

/** The local server's own identity plus every session it has heard on the LAN. */
export async function fetchSessions(): Promise<{
  self: Session | null;
  sessions: Session[];
}> {
  try {
    const res = await fetch("/api/sessions", { cache: "no-store" });
    if (!res.ok) return { self: null, sessions: [] };
    const data = await res.json();
    return {
      // The browser reaches its own host by the address it loaded the page from.
      self: data.self ? { ...data.self, host: location.hostname } : null,
      sessions: data.sessions ?? [],
    };
  } catch {
    return { self: null, sessions: [] };
  }
}

/** Mirrors the Player schema declared in server.mjs. */
type PlayerSchema = {
  name: string;
  role: Role;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flat: boolean;
};

type Callbacks = {
  players: {
    onAdd(cb: (player: PlayerSchema, sessionId: string) => void): void;
    onRemove(cb: (player: PlayerSchema, sessionId: string) => void): void;
  };
  onChange(cb: () => void): void;
};

export async function connect(name: string, role: Role, target: Session) {
  await disconnect();

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const client = new Client(`${proto}//${target.host}:${target.gamePort}`);
  const joined = await client.joinOrCreate("game", { name, role });
  room = joined;

  // The room is untyped on this side, so the callback proxy is described by
  // the shape the server actually sends.
  const $ = getStateCallbacks(joined) as unknown as (
    target: unknown,
  ) => Callbacks;

  $(joined.state).players.onAdd((player, sessionId) => {
    if (sessionId === joined.sessionId) return;

    remotes.set(sessionId, {
      id: sessionId,
      name: player.name,
      role: player.role,
      target: {
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch,
        flat: player.flat,
      },
    });
    emitRoster();

    // Mutate the existing target in place so the render loop keeps lerping
    // toward it instead of seeing a brand new object each patch.
    $(player).onChange(() => {
      const remote = remotes.get(sessionId);
      if (!remote) return;
      remote.target.x = player.x;
      remote.target.y = player.y;
      remote.target.z = player.z;
      remote.target.yaw = player.yaw;
      remote.target.pitch = player.pitch;
      remote.target.flat = player.flat;
    });
  });

  $(joined.state).players.onRemove((_player, sessionId) => {
    if (remotes.delete(sessionId)) emitRoster();
  });

  joined.onMessage("mark", (mark: NetMark) => {
    markListeners.forEach((fn) => fn(mark));
  });

  joined.onLeave(() => {
    if (remotes.size) {
      remotes.clear();
      emitRoster();
    }
  });

  return joined;
}

export async function disconnect() {
  const leaving = room;
  room = null;
  if (leaving) {
    try {
      await leaving.leave();
    } catch {
      // already gone
    }
  }
  if (remotes.size) {
    remotes.clear();
    emitRoster();
  }
}

export function sendState(
  p: [number, number, number],
  yaw: number,
  pitch: number,
  flat: boolean,
) {
  room?.send("state", { p, yaw, pitch, flat });
}

export function sendShoot(
  position: [number, number, number],
  rotation: [number, number, number],
) {
  room?.send("shoot", { position, rotation });
}

"use client";

import { Client, getStateCallbacks, type Room } from "colyseus.js";
import type { Role } from "@/components/game/types";
import { clearSkin, decodeStroke, encodedHistory, forgetSkin, paint, SELF } from "@/lib/skin";

export type RemoteTarget = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Index into POSES. */
  pose: number;
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
const graveListeners = new Set<(grave: Grave) => void>();
const killListeners = new Set<(victimId: string, by: string) => void>();

export function onRoster(fn: (ids: string[]) => void) {
  rosterListeners.add(fn);
  return () => {
    rosterListeners.delete(fn);
  };
}

/** Where somebody died, in world space. Permanent. */
export type Grave = { id: string; position: [number, number, number] };

export function onGrave(fn: (grave: Grave) => void) {
  graveListeners.add(fn);
  return () => {
    graveListeners.delete(fn);
  };
}

export function onKilled(fn: (victimId: string, by: string) => void) {
  killListeners.add(fn);
  return () => {
    killListeners.delete(fn);
  };
}

/** The local player's id in the room, which is how they recognise their own death. */
export function selfId() {
  return room?.sessionId ?? null;
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
  pose: number;
  strokes: { forEach(cb: (raw: string) => void): void };
};

type Callbacks = {
  players: {
    onAdd(cb: (player: PlayerSchema, sessionId: string) => void): void;
    onRemove(cb: (player: PlayerSchema, sessionId: string) => void): void;
  };
  graves: {
    onAdd(cb: (raw: string, index: number) => void): void;
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
        pose: player.pose,
      },
    });
    emitRoster();

    // Whatever this player has already painted on themselves, replayed so a
    // late joiner does not see a blank body.
    player.strokes?.forEach((raw) => {
      const stroke = decodeStroke(raw);
      if (stroke) paint(sessionId, stroke);
    });

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
      remote.target.pose = player.pose;
    });
  });

  $(joined.state).players.onRemove((_player, sessionId) => {
    forgetSkin(sessionId);
    if (remotes.delete(sessionId)) emitRoster();
  });

  // Paint from everyone else. The server does not echo a player their own
  // strokes — those were already drawn locally as the brush moved.
  joined.onMessage("paint", (msg: { id: string; strokes: string[] }) => {
    if (!msg?.id || !Array.isArray(msg.strokes)) return;
    for (const raw of msg.strokes) {
      const stroke = decodeStroke(raw);
      if (stroke) paint(msg.id, stroke);
    }
  });

  // Graves are state, so this fires for the ones already there when you join
  // as well as for each new one.
  $(joined.state).graves.onAdd((raw, index) => {
    const [x, y, z] = raw.split(",").map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    graveListeners.forEach((fn) => fn({ id: `grave-${index}-${raw}`, position: [x, y, z] }));
  });

  joined.onMessage("killed", (msg: { id: string; by: string }) => {
    if (!msg?.id) return;
    killListeners.forEach((fn) => fn(msg.id, msg.by ?? "the seeker"));
  });

  joined.onMessage("clearSkin", (msg: { id: string }) => {
    if (msg?.id) clearSkin(msg.id);
  });

  joined.onMessage("mark", (mark: NetMark) => {
    markListeners.forEach((fn) => fn(mark));
  });

  // A respawn is a new player as far as the server is concerned, so anything
  // already painted has to be replayed for everyone else to see it.
  const mine = encodedHistory(SELF);
  for (let i = 0; i < mine.length; i += 50) {
    joined.send("paint", { strokes: mine.slice(i, i + 50) });
  }

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
  pose: number,
) {
  room?.send("state", { p, yaw, pitch, pose });
}

/** Strokes are batched by the caller — a drag produces far more points than
 *  are worth a message each. */
export function sendPaint(strokes: string[]) {
  if (strokes.length) room?.send("paint", { strokes });
}

export function sendClearSkin() {
  room?.send("clearSkin");
}

export function sendKill(id: string, position: [number, number, number]) {
  room?.send("kill", { id, position });
}

export function sendShoot(
  position: [number, number, number],
  rotation: [number, number, number],
) {
  room?.send("shoot", { position, rotation });
}

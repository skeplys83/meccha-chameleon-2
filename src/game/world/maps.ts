import { ROOM_HALF, ROOM_LIMIT } from "../shared/protocol.ts";
import {
  DEFAULT_MAP,
  DEFAULT_MATCH_MAP,
  LOBBY_MAP,
  MAP_IDS,
  MATCH_MAP_IDS,
  type MapId,
} from "./mapIds.ts";

export { DEFAULT_MAP, DEFAULT_MATCH_MAP, LOBBY_MAP, type MapId };

/**
 * Every map the game can load. **All of them are one `.glb` exported from
 * Blender** — there is no second kind, and no build step: you export over
 * `public/maps/<id>.glb` and the numbers below are typed to match. See
 * "Editing a map" in `world/CLAUDE.md`.
 *
 * Everything here that describes the *file* rather than the menu is typed by
 * hand and can therefore drift from the `.glb`, so `checkLevel` in
 * `levelScene.ts` compares the two at load in development and says so in the
 * console.
 *
 * This file is imported by **Node** — `server/messages.ts` reads `mapLimit` —
 * so it must import nothing but other import-free modules, by relative `.ts`
 * path rather than the `@/` alias the bundler owns.
 */
export type ToneMappingName =
  | "NoToneMapping"
  | "LinearToneMapping"
  | "ReinhardToneMapping"
  | "CineonToneMapping"
  | "ACESFilmicToneMapping";

export type ShadowMapTypeName =
  | "BasicShadowMap"
  | "PCFShadowMap"
  | "PCFSoftShadowMap"
  | "VSMShadowMap";

export type OutputColorSpaceName =
  | "NoColorSpace"
  | "SRGBColorSpace"
  | "LinearSRGBColorSpace";

export type MapRenderConfig = {
  /** Three.js tone mapping mode. */
  toneMapping?: ToneMappingName;
  /** Camera exposure, used with ACES or filmic mapping. */
  exposure?: number;
  /** Output color space for the renderer. */
  outputColorSpace?: OutputColorSpaceName;
  /** Whether to antialias the canvas. */
  antialias?: boolean;
  /** Pixel ratio override for the canvas. */
  dpr?: number | [number, number];
  /** Shadow settings for the canvas renderer. */
  shadows?: {
    enabled?: boolean;
    type?: ShadowMapTypeName;
    bias?: number;
    normalBias?: number;
    mapSize?: [number, number];
  };
  /** Optional fog for the map. */
  fog?: { color: string; near: number; far: number } | null;
};

export type GameMap = {
  id: MapId;
  /** Shown in the menu. Free to change — unlike the id. */
  name: string;
  /** One-line description of how it plays, for the menu. */
  blurb: string;
  /** The URL the browser fetches, under `public/`. */
  src: string;
  /**
   * Where a body's centre starts. Must match the `spawn` empty in the `.blend`;
   * it is repeated here because `Scene.tsx` needs it before the file has loaded.
   */
  spawn: [number, number, number];
  /**
   * Half-extent of the playable footprint. `server/messages.ts` clamps every
   * reported position to this, so it must cover the collision layer — too small
   * and players walk somewhere they cannot be seen to walk.
   */
  bound: number;
  /** The whole playable round, hiding included, before the reveal. */
  roundSeconds: number;
  /** Whether this map is open to the sky. */
  sky: boolean;
  /** What is behind the map where there is no geometry. */
  background: string;
  /** The three.js presentation stack for this map. */
  render: MapRenderConfig;
};

export const MAPS: Record<MapId, GameMap> = {
  arena: {
    id: "arena",
    name: "Arena",
    blurb: "40×40, white, twenty-five pieces of cover. Nine painted to match a swatch.",
    src: "/maps/arena.glb",
    spawn: [0, 2, 0],
    // The shell is built on ROOM_HALF, and the walls straddle it by half their
    // thickness. `mapLimit` takes the same 0.1 of slack off it that ROOM_LIMIT
    // has always carried — see shared/CLAUDE.md.
    bound: ROOM_HALF,
    // Unused: the arena is the waiting room, never a match map.
    roundSeconds: 120,
    // The waiting room has no visible lid, so there is something up there to see.
    sky: true,
    background: "#ffffff",
    render: {
      toneMapping: "ACESFilmicToneMapping",
      exposure: 0.6,
      outputColorSpace: "SRGBColorSpace",
      antialias: true,
      dpr: [1, 2],
      shadows: {
        enabled: true,
        type: "PCFSoftShadowMap",
        bias: -0.0005,
        normalBias: 0.02,
        mapSize: [1024, 1024],
      },
      fog: null,
    },
  },
  dungeon: {
    id: "dungeon",
    name: "Dungeon",
    blurb: "One hall, two staggered partitions and four torches. Small, for testing.",
    src: "/maps/dungeon.glb",
    spawn: [0, 2, 0],
    // 7x7 tiles of 4, plus the half-thickness the perimeter walls straddle by.
    bound: 14.5,
    roundSeconds: 300,
    sky: false,
    background: "#0b0b0f",
    render: {
      toneMapping: "ACESFilmicToneMapping",
      exposure: 1.0,
      outputColorSpace: "SRGBColorSpace",
      antialias: true,
      dpr: [1, 2],
      shadows: {
        enabled: true,
        type: "PCFSoftShadowMap",
        bias: -0.0005,
        normalBias: 0.02,
        mapSize: [1024, 1024],
      },
      fog: null,
    },
  },
};

export const MAP_LIST: GameMap[] = MAP_IDS.map((id) => MAPS[id]);

/** The maps a match can be played on — everything a picker should offer. */
export const MATCH_MAP_LIST: GameMap[] = MATCH_MAP_IDS.map((id) => MAPS[id]);

// Adding an id without a map, or a map without an id, fails here rather than
// showing an empty menu entry or silently refusing a legitimate choice.
for (const id of MAP_IDS) {
  if (!MAPS[id]) throw new Error(`world/maps.ts has no entry for map id "${id}"`);
}

/** Anything off the wire has to be checked against the table before it is used. */
export function safeMapId(id: unknown): MapId {
  return typeof id === "string" && id in MAPS ? (id as MapId) : DEFAULT_MAP;
}

/** The menu label for an id off the wire — a lobby listing carries the id only. */
export const mapName = (id: unknown) => MAPS[safeMapId(id)].name;

/** Where to put a body on this map. Stable identity — see `GameMap.spawn`. */
export const mapSpawn = (id: unknown) => MAPS[safeMapId(id)].spawn;

/** How long a round on this map runs. Read by the server, which is the point. */
export const mapRoundSeconds = (id: unknown) => MAPS[safeMapId(id)].roundSeconds;

/** The slack between the wall and the bound a reported position is clamped to. */
const CHEAT_MARGIN = ROOM_HALF - ROOM_LIMIT;

/** How far out a player on this map may claim to be. */
export const mapLimit = (id: unknown) => MAPS[safeMapId(id)].bound - CHEAT_MARGIN;

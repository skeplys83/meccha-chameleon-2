import * as THREE from "three";
import { PARTS, PART_SHAPE, type Part } from "@/game/figure/parts";
import { MAX_STROKES } from "@/game/shared/protocol";

/** Per-player paint. */

export type Skin = Record<Part, THREE.CanvasTexture>;

export type Stroke = {
  part: Part;
  u: number;
  v: number;
  /** Brush radius in figure-local units — the same physical dot everywhere on the body. */
  size: number;
  color: string;
};

/** How much of a part's texture one unit of surface covers. */
function textureScale(part: Part) {
  const { radius, length } = PART_SHAPE[part];
  return {
    u: 1 / (2 * Math.PI * radius),
    v: 1 / (length + Math.PI * radius),
  };
}

const TEXTURE_SIZE = 256;

/** Everything painted on a body, so a part re-mount can repaint from scratch. */
const skins = new Map<string, Skin>();
const history = new Map<string, Stroke[]>();

/** Local player's id in these maps; remotes use their Colyseus session id. */
export const SELF = "self";

export { MAX_STROKES };

function blankTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function getSkin(id: string): Skin {
  const existing = skins.get(id);
  if (existing) return existing;
  const skin = Object.fromEntries(PARTS.map((p) => [p, blankTexture()])) as Skin;
  skins.set(id, skin);
  return skin;
}

export function paint(id: string, stroke: Stroke) {
  const texture = getSkin(id)[stroke.part];
  if (!texture) return;
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scale = textureScale(stroke.part);
  const rx = Math.max(0.75, stroke.size * scale.u * canvas.width);
  const ry = Math.max(0.75, stroke.size * scale.v * canvas.height);
  const x = stroke.u * canvas.width;
  // Canvas Y grows downward, UV V grows upward.
  const y = (1 - stroke.v) * canvas.height;

  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Capsule UVs wrap around the limb, so a dot near either edge has to be
  // drawn again on the far side or the seam shows a hard cut.
  if (x < rx) {
    ctx.beginPath();
    ctx.ellipse(x + canvas.width, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (x > canvas.width - rx) {
    ctx.beginPath();
    ctx.ellipse(x - canvas.width, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  texture.needsUpdate = true;

  const log = history.get(id) ?? [];
  log.push(stroke);
  if (log.length > MAX_STROKES) log.splice(0, log.length - MAX_STROKES);
  history.set(id, log);
}

export function clearSkin(id: string) {
  const skin = skins.get(id);
  if (!skin) return;
  for (const part of PARTS) {
    const texture = skin[part];
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  }
  history.set(id, []);
}

/** Drop every body's paint, yours included. */
export function forgetAllSkins() {
  for (const id of [...skins.keys()]) forgetSkin(id);
}

export function forgetSkin(id: string) {
  const skin = skins.get(id);
  if (skin) for (const part of PARTS) skin[part].dispose();
  skins.delete(id);
  history.delete(id);
}

const partIndex = new Map(PARTS.map((p, i) => [p, i]));

/** Compact wire form — strokes are stored per player on the server, so they
 *  have to stay small. */
export function encodeStroke(s: Stroke) {
  return [
    partIndex.get(s.part) ?? 0,
    s.u.toFixed(3),
    s.v.toFixed(3),
    s.size.toFixed(3),
    s.color.replace("#", ""),
  ].join(",");
}

export function decodeStroke(raw: string): Stroke | null {
  const [p, u, v, size, color] = raw.split(",");
  const part = PARTS[Number(p)];
  if (!part || !/^[0-9a-fA-F]{6}$/.test(color ?? "")) return null;
  const stroke = {
    part,
    u: Number(u),
    v: Number(v),
    size: Number(size),
    color: `#${color}`,
  };
  return Number.isFinite(stroke.u) && Number.isFinite(stroke.v) && Number.isFinite(stroke.size)
    ? stroke
    : null;
}

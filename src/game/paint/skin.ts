import * as THREE from "three";
import { PARTS, PART_SHAPE, type Part } from "@/game/figure/parts";
import { MAX_STROKES } from "@/game/shared/protocol";

/**
 * Per-player paint. Every figure part owns a small canvas that is used as its
 * material map, so painting is just drawing a dot into a 2D context at the UV
 * the raycast reported. Like `remotes` in net/remotes.ts these live outside
 * React — strokes arrive faster than a render is worth.
 *
 * The part table itself belongs to `figure/parts.ts`: the brush maths here and
 * the geometry there must be computed from the same radii or the dot lands at
 * the wrong size.
 */

export type Skin = Record<Part, THREE.CanvasTexture>;

export type Stroke = {
  part: Part;
  u: number;
  v: number;
  /**
   * Brush radius in figure-local units — the same physical dot everywhere on
   * the body. It has to be converted per part on the way to the canvas: a
   * texture wraps its part, so the same fraction of it is a much bigger mark
   * on the head than on a forearm.
   */
  size: number;
  color: string;
};

/**
 * How much of a part's texture one unit of surface covers. U runs around the
 * circumference, V runs along the part from end to end (the round caps add
 * half a circumference between them), so the two are different scales and the
 * brush has to be an ellipse in texture space to land as a circle on the body.
 */
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

/**
 * Drop every body's paint, yours included.
 *
 * **Every change of room is a clean slate**, not just a join: `Game.tsx` calls
 * this from `onLeftRoom`, so a match opens unpainted and so does the lobby you
 * come home to. Paint used to be carried across a hand-off — `encodedHistory`
 * existed solely to replay it — and no longer is.
 *
 * Without it a rejoin also showed you the leftover skins of players from the
 * last session, keyed by session ids that will never be seen again.
 */
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

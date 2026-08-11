import { useEffect, useMemo, useRef } from "react";
import { SWATCHES } from "@/game/paint/palette";
import { MAX_SIZE, MIN_SIZE, type Brush } from "./brush";

const WHEEL = 118;

function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

/**
 * The wheel carries hue and saturation, the slider carries value. Reading all
 * three back out of the chosen colour is what keeps the marker, the slider and
 * the swatches agreeing with each other.
 */
function hexToHsv(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function ColorWheel({
  h,
  s,
  v,
  onPick,
}: {
  h: number;
  s: number;
  v: number;
  onPick: (h: number, s: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  // Drawn at full value once: darkening lives on the slider, so the wheel stays
  // a stable map you can learn.
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const image = ctx.createImageData(WHEEL, WHEEL);
    const radius = WHEEL / 2;
    for (let y = 0; y < WHEEL; y++) {
      for (let x = 0; x < WHEEL; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.hypot(dx, dy);
        const i = (y * WHEEL + x) * 4;
        if (dist > radius) {
          image.data[i + 3] = 0;
          continue;
        }
        const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
        const hex = hsvToHex(hue, Math.min(1, dist / radius), 1);
        image.data[i] = parseInt(hex.slice(1, 3), 16);
        image.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        image.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        // Feather the rim so the circle does not look jagged.
        image.data[i + 3] = Math.round(255 * Math.min(1, radius - dist));
      }
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = canvas.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const radius = WHEEL / 2;
    const dx = ((e.clientX - rect.left) / rect.width) * WHEEL - radius;
    const dy = ((e.clientY - rect.top) / rect.height) * WHEEL - radius;
    const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
    onPick(hue, Math.min(1, Math.hypot(dx, dy) / radius));
  };

  const angle = h * Math.PI * 2;
  const marker = {
    left: WHEEL / 2 + Math.cos(angle) * s * (WHEEL / 2),
    top: WHEEL / 2 + Math.sin(angle) * s * (WHEEL / 2),
  };

  return (
    <div className="relative" style={{ width: WHEEL, height: WHEEL }}>
      <canvas
        ref={canvas}
        width={WHEEL}
        height={WHEEL}
        className="cursor-crosshair touch-none rounded-full"
        style={{ width: WHEEL, height: WHEEL }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => dragging.current && pick(e)}
        onPointerUp={() => {
          dragging.current = false;
        }}
      />
      {/* Where the current colour sits, so the wheel reflects the brush. */}
      <span
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: marker.left, top: marker.top, background: hsvToHex(h, s, v) }}
      />
    </div>
  );
}

/**
 * The palette. It opens by itself the moment the cursor touches your figure
 * and then stays open until the ▾ button minimises it. The collapsed pill
 * opens it too — which is how a hunter gets to it, since they hold the pointer
 * lock and have no cursor to hover with.
 */
export function PaintPanel({
  open,
  onOpenChange,
  brush,
  onBrush,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brush: Brush;
  onBrush: (b: Brush) => void;
  onClear: () => void;
}) {
  const { h, s, v } = useMemo(() => hexToHsv(brush.color), [brush.color]);

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="absolute bottom-4 right-4 flex select-none items-center gap-2 rounded-lg bg-black/70 px-3 py-2 font-mono text-xs text-neutral-200 backdrop-blur transition hover:bg-black/80"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-white/40"
          style={{ background: brush.color }}
        />
        Paint
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-4 right-4 w-[142px] select-none rounded-lg bg-black/70 p-2.5 font-mono text-[11px] text-neutral-100 backdrop-blur"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="uppercase tracking-widest text-neutral-400">Paint</span>
        <button
          onClick={() => onOpenChange(false)}
          title="Minimise"
          className="flex h-5 w-6 items-center justify-center rounded border border-neutral-500 text-sm leading-none text-neutral-100 transition hover:bg-neutral-600"
        >
          ▾
        </button>
      </div>

      <ColorWheel
        h={h}
        s={s}
        v={v}
        onPick={(hue, sat) => onBrush({ ...brush, color: hsvToHex(hue, sat, v || 1) })}
      />

      <label className="mt-2 block text-[10px] uppercase tracking-wide text-neutral-400">
        Brightness
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={v}
          onChange={(e) => onBrush({ ...brush, color: hsvToHex(h, s, Number(e.target.value)) })}
          className="w-full cursor-pointer accent-neutral-200"
        />
      </label>
      <label className="block text-[10px] uppercase tracking-wide text-neutral-400">
        Brush size
        <input
          type="range"
          min={MIN_SIZE}
          max={MAX_SIZE}
          step={0.005}
          value={brush.size}
          onChange={(e) => onBrush({ ...brush, size: Number(e.target.value) })}
          className="w-full cursor-pointer accent-neutral-300"
        />
      </label>

      <div className="mt-1.5 grid grid-cols-5 gap-1">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            onClick={() => onBrush({ ...brush, color: hex })}
            style={{ background: hex }}
            className={`h-4 rounded-sm border transition ${
              brush.color.toLowerCase() === hex
                ? "border-white"
                : "border-white/20 hover:border-white/60"
            }`}
          />
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span
            className="rounded-full border border-white/30"
            style={{
              background: brush.color,
              width: 5 + brush.size * 90,
              height: 5 + brush.size * 90,
            }}
          />
          {brush.color}
        </span>
        <button
          onClick={onClear}
          className="rounded border border-neutral-600 px-1.5 py-0.5 text-neutral-300 transition hover:bg-neutral-700"
        >
          clear
        </button>
      </div>
    </div>
  );
}

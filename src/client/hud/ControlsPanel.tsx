import { POSES } from "@/client/figure/poses";

type Row = [key: string, action: string];

/**
 * The chameleon's legend, and the only one there is.
 *
 * **A hunter gets no panel at all.** They walk and they shoot, and both of
 * those are what every first-person game has already taught them — the legend
 * they used to get said "WASD · Space · Mouse · Left click", which is four rows
 * of nothing anybody had to be told. A chameleon is the one who has to learn
 * something: climbing, turning the figure on the spot, the poses, the brush.
 *
 * **What every game already teaches is left out here too**: WASD to move, Space
 * to jump, the wheel to zoom. Printing them pushed the rows that are actually
 * particular to this game down the panel.
 */
const CHAMELEON: Row[] = [
  ["Q / E", "Turn your figure"],
  ["Right drag", "Look around"],
  ["Left drag", "Paint your body"],
  ["Right drag", "Brush size (on you)"],
  ["F", "Pick a colour off the world"],
  ...POSES.map((p, i): Row => [String(i + 1), p.label]),
];

export function ControlsPanel() {
  return (
    <div className="pointer-events-none absolute right-4 top-4 select-none rounded-lg bg-black/55 px-4 py-3 font-mono text-xs text-neutral-100 backdrop-blur">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-400">
        chameleon
      </div>
      <table>
        <tbody>
          {/* Indexed, not keyed on the key: "Right drag" means two different
              things and appears twice. */}
          {CHAMELEON.map(([key, action], i) => (
            <tr key={i}>
              <td className="py-0.5 pr-4 align-middle">
                <span className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-sm font-semibold text-white">
                  {key}
                </span>
              </td>
              <td className="align-middle text-neutral-400">{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[11px] text-neutral-500">
        Esc pauses · your cursor stays free
      </div>
    </div>
  );
}

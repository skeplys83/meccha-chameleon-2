import type { KeyboardControlsEntry } from "@react-three/drei";
import { POSES } from "@/game/figure/poses";

export type Control =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "jump"
  | "turnLeft"
  | "turnRight"
  | "descend"
  | `pose${number}`;

/** `1`–`8` select a pose; index 0 is the upright stance. */
export const poseControl = (index: number) => `pose${index}` as Control;

export const controlMap: KeyboardControlsEntry<Control>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "jump", keys: ["Space"] },
  { name: "turnLeft", keys: ["KeyQ"] },
  { name: "turnRight", keys: ["KeyE"] },
  // A hider's climb-down. Space is the climb-up, because it is already the key
  // you press to leave the ground.
  { name: "descend", keys: ["ShiftLeft", "ShiftRight"] },
  ...POSES.map((_, i) => ({
    name: poseControl(i),
    keys: [`Digit${i + 1}`],
  })),
];

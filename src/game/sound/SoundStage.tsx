"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { onKilled, onShot, remotes } from "@/game/net";
import { playSound, preloadSounds, updateListener } from "./engine";
import { Stepper, jitteredStepRate } from "./footsteps";

/**
 * Everything the world makes a noise about. Renders nothing.
 *
 * It sits inside the Canvas because it needs the camera every frame — the
 * listener has to follow your head or nothing is where it sounds like it is.
 *
 * Sounds arrive two ways, and the split is the point:
 *  - **Events** (a shot, a death) come off the network, because they happen at
 *    an instant and everyone must hear the same one.
 *  - **Footsteps** are derived locally from positions everyone already has. See
 *    `footsteps.ts`.
 */
export function SoundStage() {
  const steppers = useRef(new Map<string, Stepper>());

  useEffect(() => {
    // Decode now, so the first shot of the round is not the one that has to wait
    // for a network fetch. The context is still suspended until the join click.
    void preloadSounds();
  }, []);

  // A shot is heard at the shooter, not at what they hit. `remotes` never holds
  // you, so your own gun comes back positionless — which is right, it is at your
  // ear, and a panner at zero distance behaves badly.
  useEffect(
    () =>
      onShot((shooterId) => {
        const shooter = remotes.get(shooterId);
        playSound("shotgun", {
          position: shooter
            ? [shooter.target.x, shooter.target.y, shooter.target.z]
            : undefined,
        });
      }),
    [],
  );

  // Everyone hears a death, wherever it happened. For the victim it lands just
  // before their own death screen.
  useEffect(
    () =>
      onKilled((_victimId, _by, position) => {
        playSound("squash", { position });
      }),
    [],
  );

  useFrame(({ camera }, delta) => {
    updateListener(camera);

    const live = steppers.current;
    for (const [id, remote] of remotes) {
      let stepper = live.get(id);
      if (!stepper) {
        stepper = new Stepper();
        live.set(id, stepper);
      }
      const { x, y, z } = remote.target;
      if (stepper.update(x, y, z, delta)) {
        playSound("step", { position: [x, y, z], rate: jitteredStepRate(remote.role) });
      }
    }

    // Drop steppers for anyone who has left, or the map grows for the session.
    if (live.size > remotes.size) {
      for (const id of live.keys()) if (!remotes.has(id)) live.delete(id);
    }
  });

  return null;
}

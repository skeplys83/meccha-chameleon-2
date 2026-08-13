import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { onCaught, onShot, onWhistle, remotes } from "@/game/net";
import { playSound, updateListener } from "./engine";
import { Stepper, jitteredStepRate, strideFor } from "./footsteps";

/** Nothing is preloaded here, and there is no mount effect that fetches. */
export function SoundStage() {
  const steppers = useRef(new Map<string, Stepper>());

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

  // A whistle comes from whoever let it out, so it gives their position away.
  // Your own resolves to no position — `remotes` never holds you — which is
  // right: it is at your own head, and a panner at zero distance behaves badly.
  useEffect(
    () =>
      onWhistle((whistlerId) => {
        const who = remotes.get(whistlerId);
        playSound("whistle", {
          position: who ? [who.target.x, who.target.y, who.target.z] : undefined,
        });
      }),
    [],
  );

  // Everyone hears a catch, at the spot it happened — which is how the
  // chameleons still hiding learn the hunt is closing in, and roughly where.
  // It is positional for exactly that reason, unlike the three round sounds.
  useEffect(
    () =>
      onCaught((_victimId, _by, position) => {
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
        stepper = new Stepper(strideFor(remote.role));
        live.set(id, stepper);
      }
      const { x, y, z } = remote.target;
      // Climbing is silent. Their stepper only sees a position, and sliding
      // along a wall or walking a ceiling looks exactly like walking a floor.
      if (remote.target.cling) {
        stepper.reset();
        continue;
      }
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

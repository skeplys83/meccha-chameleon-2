"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { controlMap } from "./controls";
import { Player } from "./Player";
import { Room } from "./Room";
import { Marks } from "./Marks";
import { Viewmodel } from "./Viewmodel";
import { RemotePlayers } from "./RemotePlayers";
import type { Mark, Role } from "./types";
import { onMark } from "@/lib/net";

const MARK_LIFETIME = 3000;

export default function Scene({ role }: { role: Role | null }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    const off = onMark((m) => {
      setMarks((prev) => [...prev, m]);
      pending.push(
        setTimeout(
          () => setMarks((prev) => prev.filter((x) => x.id !== m.id)),
          MARK_LIFETIME,
        ),
      );
    });
    return () => {
      off();
      pending.forEach(clearTimeout);
    };
  }, []);

  return (
    <KeyboardControls map={controlMap}>
      <Canvas shadows camera={{ fov: 60, position: [0, 5, 11] }} dpr={[1, 2]}>
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={1.2} />
        <directionalLight
          castShadow
          position={[6, 12, 6]}
          intensity={1.2}
          shadow-mapSize={[2048, 2048]}
        />
        <Physics gravity={[0, -20, 0]}>
          <Room />
          {role && <Player role={role} />}
        </Physics>
        <RemotePlayers />
        <Marks marks={marks} />
        {role === "seeker" && <Viewmodel />}
      </Canvas>
    </KeyboardControls>
  );
}

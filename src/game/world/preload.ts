import { useGLTF } from "@react-three/drei";
import { MAPS, safeMapId } from "./maps";

/** Start fetching one map's file, ahead of anybody standing on it. */
export function preloadMap(id: unknown) {
  useGLTF.preload(MAPS[safeMapId(id)].src);
}

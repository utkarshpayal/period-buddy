import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFrame } from "./FiberCanvas";
import { gl3dStarting, gl3dWorked } from "./glSupport";

/**
 * Marks a 3D view's start (see glSupport.ts), and clears it if the view goes
 * away normally or the app is sent to the background (so the system closing
 * it later isn't taken for a crash).
 */
export function useGl3dGuard() {
  useState(() => {
    gl3dStarting();
    return true;
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s !== "active" && gl3dWorked());
    return () => {
      sub.remove();
      gl3dWorked();
    };
  }, []);
}

/** Inside a canvas: clears the mark once frames have drawn for a moment. */
export function GlHealthy() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    setTimeout(gl3dWorked, 1500);
  });
  return null;
}

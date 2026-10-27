import { requireOptionalNativeModule } from "expo-modules-core";

/** expo-gl is only in builds made after the Body Map shipped; older ones get the 2D view. */
export function hasWebGL(): boolean {
  return requireOptionalNativeModule("ExponentGLObjectManager") != null;
}

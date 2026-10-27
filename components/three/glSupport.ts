import { requireOptionalNativeModule } from "expo-modules-core";
import { File, Paths } from "expo-file-system";
import { APP_VERSION } from "../../lib/api";

/*
 * Whether this phone draws the 3D views (Body Map, Forest), else the 2D ones.
 *
 * expo-gl is only in builds made after the Body Map shipped. Beyond that, a
 * phone's GPU driver can kill the app while a 3D view starts, and no JS
 * error handling catches that. So each 3D view marks the start (`gl3dStarting`)
 * and clears the mark once frames have drawn (`gl3dWorked`) or it unmounts.
 * A mark left over from a run that died means this phone gets 2D from then
 * on, until the next app version tries again. The mark is a tiny file read
 * synchronously, because the choice is made while screens load.
 */

const guardFile = () => new File(Paths.document, "gl3d-guard.txt");

const read = (): string => {
  try {
    const f = guardFile();
    return f.exists ? f.textSync() : "";
  } catch {
    return "";
  }
};

const write = (value: string | null) => {
  try {
    const f = guardFile();
    if (value === null) {
      if (f.exists) f.delete();
    } else {
      if (!f.exists) f.create();
      f.write(value);
    }
  } catch {
    // Can't keep the mark: 3D just won't be switched off after a crash.
  }
};

let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  if (requireOptionalNativeModule("ExponentGLObjectManager") == null) return (cached = false);
  const mark = read();
  if (mark === `starting:${APP_VERSION}` || mark === `blocked:${APP_VERSION}`) {
    // The last 3D start on this version never finished: the app died there.
    write(`blocked:${APP_VERSION}`);
    return (cached = false);
  }
  return (cached = true);
}

/** Call as a 3D view mounts, before its GL context is made. */
export function gl3dStarting() {
  write(`starting:${APP_VERSION}`);
}

/** Call once frames have drawn, and when the view unmounts normally. */
export function gl3dWorked() {
  if (read().startsWith("starting:")) write(null);
}

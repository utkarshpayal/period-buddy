import * as THREE from "three";

/**
 * Soft radial textures for glows, ripples and contact shadows, made in JS
 * (there's no canvas on native). Shared by the Body Map and the Forest.
 */
export function radialTexture(kind: "glow" | "ring" | "shadow") {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      let a: number;
      if (kind === "glow") a = Math.max(0, 1 - r) ** 2.2;
      else if (kind === "ring") a = Math.max(0, 1 - Math.abs(r - 0.82) / 0.12) * (r < 1 ? 1 : 0);
      else a = Math.max(0, 1 - r) ** 1.6 * 0.9;
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = kind === "shadow" ? 40 : 255;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

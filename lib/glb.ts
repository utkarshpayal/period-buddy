/**
 * Minimal GLB reader for the Body Map model (assets/models/female-body.glb,
 * written by scripts/generate-body-model.mjs): position/normal/index
 * accessors, optional COLOR_0 and a base colour per mesh. No textures, no TextDecoder (Hermes),
 * so it runs the same on native and web. Unit-tested.
 */
export type GlbMesh = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** Per-vertex colour (skin/hair/eyes with baked occlusion), when the mesh has one. */
  colors: Float32Array | null;
  color: [number, number, number];
};

const COMPONENT: Record<number, { new (buf: ArrayBuffer, off: number, len: number): ArrayBufferView }> = {
  5126: Float32Array as any,
  5125: Uint32Array as any,
  5123: Uint16Array as any,
};

export function parseGlb(bytes: Uint8Array): GlbMesh[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB file");
  const jsonLength = view.getUint32(12, true);
  let text = "";
  for (let i = 0; i < jsonLength; i++) text += String.fromCharCode(bytes[20 + i]);
  const json = JSON.parse(text);
  const binStart = 20 + jsonLength + 8;
  // Copy the binary chunk so typed arrays start 4-byte aligned.
  const bin = bytes.slice(binStart, binStart + view.getUint32(20 + jsonLength, true)).buffer;

  const accessor = (i: number) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const size = a.type === "VEC3" ? 3 : 1;
    return new COMPONENT[a.componentType](bin, bv.byteOffset ?? 0, a.count * size);
  };

  return json.meshes.map((mesh: any) => {
    const prim = mesh.primitives[0];
    const base = json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorFactor ?? [0.9, 0.8, 0.76];
    return {
      name: mesh.name,
      positions: accessor(prim.attributes.POSITION) as Float32Array,
      normals: accessor(prim.attributes.NORMAL) as Float32Array,
      indices: accessor(prim.indices) as Uint16Array | Uint32Array,
      colors: prim.attributes.COLOR_0 != null ? (accessor(prim.attributes.COLOR_0) as Float32Array) : null,
      color: [base[0], base[1], base[2]],
    };
  });
}

import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { parseGlb, type GlbMesh } from "../../lib/glb";

let cached: Promise<GlbMesh[]> | null = null;

/** The Body Map's GLB, read once per session. */
export function loadBodyModel(): Promise<GlbMesh[]> {
  cached ??= (async () => {
    const asset = Asset.fromModule(require("../../assets/models/female-body.glb"));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const bytes =
      Platform.OS === "web"
        ? new Uint8Array(await (await fetch(uri)).arrayBuffer())
        : await new File(uri).bytes();
    return parseGlb(bytes);
  })().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

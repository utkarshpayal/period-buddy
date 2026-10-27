import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { shouldUseLowDetail } from "../../lib/forestView";

let lowDetailDevice: boolean | undefined;

/**
 * Low-end phone (little memory or an old model): the 3D views (Forest, Body
 * Map) draw a lighter scene. Read once; false on web or when expo-device is
 * missing from the build.
 */
export function isLowDetailDevice(): boolean {
  if (lowDetailDevice !== undefined) return lowDetailDevice;
  lowDetailDevice = false;
  if (Platform.OS === "web") return lowDetailDevice;
  try {
    if (requireOptionalNativeModule("ExpoDevice")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Device = require("expo-device") as typeof import("expo-device");
      lowDetailDevice = shouldUseLowDetail({ memoryBytes: Device.totalMemory, yearClass: Device.deviceYearClass });
    }
  } catch {
    lowDetailDevice = false;
  }
  return lowDetailDevice;
}
